import { useState, useRef, useEffect } from "react";

const MODEL = "claude-sonnet-4-20250514";

async function callClaude(messages, system = "", maxTokens = 2000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map(b => b.text || "").join("\n").trim() || "";
}

function safeParseJSON(raw) {
  const clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(clean);
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Spinner({ label = "Processing…" }) {
  return (
    <div className="flex items-center gap-2 text-indigo-600 text-sm">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      {label}
    </div>
  );
}

function ScorePill({ score }) {
  const bg = score >= 8 ? "bg-emerald-100 text-emerald-700" : score >= 6 ? "bg-blue-100 text-blue-700" : score >= 4 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600";
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${bg}`}>{score}/10</span>;
}

function Nav({ isLoggedIn, onLogin, onLogout, onHome }) {
  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
      <div className="flex items-center gap-2 cursor-pointer" onClick={onHome}>
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow">
          <span className="text-white font-bold text-sm">S</span>
        </div>
        <span className="font-extrabold text-gray-800 text-lg tracking-tight">SocketHR</span>
      </div>
      {isLoggedIn ? (
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs">A</div>
          <span className="text-sm text-gray-600 hidden sm:block">Alex Johnson</span>
          <button onClick={onLogout} className="text-xs text-gray-400 hover:text-red-500 transition">Sign out</button>
        </div>
      ) : (
        <button onClick={onLogin} className="text-sm font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-4 py-1.5 rounded-lg transition">Log in</button>
      )}
    </nav>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const [job, setJob] = useState({ title: "", description: "", requirements: "", culture: "" });
  const [resumeFiles, setResumeFiles] = useState([]); // [{name, base64, text}]
  const fileInputRef = useRef();
  const [candidates, setCandidates] = useState([]);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailState, setEmailState] = useState("idle"); // idle | generating | editing | sent
  const [dragging, setDragging] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  function requireLogin(nav) {
    if (isLoggedIn) { nav(); return; }
    setPendingNav(() => nav);
    setPage("login");
  }

  function handleLogin() {
    setIsLoggedIn(true);
    if (pendingNav) { pendingNav(); setPendingNav(null); }
    else setPage(candidates.length ? "results" : "home");
  }

  // ── File handling ─────────────────────────────────────────────────────────
  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const newFiles = [];
    for (const file of files) {
      const base64 = await readFileAsBase64(file);
      newFiles.push({ name: file.name, base64, type: file.type });
    }
    setResumeFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...newFiles.filter(f => !existing.has(f.name))];
    });
    e.target.value = "";
  }

  function readFileAsBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
  }

  function removeFile(name) {
    setResumeFiles(prev => prev.filter(f => f.name !== name));
  }

  // ── Core analysis ─────────────────────────────────────────────────────────
  async function analyzeResumes() {
    if (!resumeFiles.length) return alert("Please upload at least one resume.");
    setLoading(true);
    setCandidates([]);

    try {
      // Process resumes individually then batch-score
      setAnalysisStatus(`Extracting info from ${resumeFiles.length} resume(s)…`);
      const extracted = [];

      for (let i = 0; i < resumeFiles.length; i++) {
        const f = resumeFiles[i];
        setAnalysisStatus(`Reading resume ${i + 1} of ${resumeFiles.length}: ${f.name}…`);
        const isPdf = f.type === "application/pdf";
        const content = isPdf
          ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } },
             { type: "text", text: `Extract the following fields from this resume as a single JSON object. Respond ONLY with raw JSON, no markdown.\n\nFields:\n- name (string, "Unknown Candidate ${i+1}" if missing)\n- email (string, "" if missing)\n- phone (string, "" if missing)\n- years_experience (number, estimate)\n- skills (array of strings, top 8)\n- education (string, highest degree + institution)\n- recent_role (string, most recent title + company)\n- raw_summary (2-3 sentence background narrative)` }]
          : [{ type: "text", text: `Extract the following fields from this resume text as a single JSON object. Respond ONLY with raw JSON, no markdown.\n\nResume text:\n${atob(f.base64)}\n\nFields:\n- name (string, "Unknown Candidate ${i+1}" if missing)\n- email (string, "" if missing)\n- phone (string, "" if missing)\n- years_experience (number, estimate)\n- skills (array of strings, top 8)\n- education (string, highest degree + institution)\n- recent_role (string, most recent title + company)\n- raw_summary (2-3 sentence background narrative)` }];

        const raw = await callClaude([{ role: "user", content }], "", 1000);
        extracted.push(safeParseJSON(raw));
      }

      // Step 2: score all candidates against the job
      setAnalysisStatus("Scoring all candidates against job requirements…");
      const scoringPrompt = `You are an expert recruiter. Score each candidate for the following job. Return ONLY a raw JSON array, no markdown.

JOB TITLE: ${job.title}
JOB DESCRIPTION: ${job.description}
REQUIREMENTS: ${job.requirements}
CULTURE & FIT: ${job.culture}

CANDIDATES:
${extracted.map((c, i) => `Candidate ${i} (index ${i}): ${JSON.stringify(c)}`).join("\n")}

For each candidate return:
- index (0-based, matching input order)
- score (integer 1-10, be discriminating — use the full range)
- score_rationale (1 sentence explaining the score)
- strengths (array of 3-5 specific bullets grounded in the resume)
- weaknesses (array of 2-3 specific bullets grounded in the resume)
- fit_summary (1 concise sentence on overall fit for THIS role)`;

      const scoredRaw = await callClaude([{ role: "user", content: scoringPrompt }], "", 3000);
      const scored = safeParseJSON(scoredRaw);

      const merged = extracted.map((c, i) => {
        const s = scored.find(x => x.index === i) || scored[i] || {};
        return { id: i, ...c, fileName: resumeFiles[i].name, score: s.score || 5, score_rationale: s.score_rationale || "", strengths: s.strengths || [], weaknesses: s.weaknesses || [], fit_summary: s.fit_summary || "" };
      }).sort((a, b) => b.score - a.score);

      setCandidates(merged);
      setPage("results");
    } catch (err) {
      console.error(err);
      alert("Analysis failed: " + err.message);
    }
    setLoading(false);
    setAnalysisStatus("");
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newChat = [...chat, { role: "user", content: msg }];
    setChat(newChat);
    setChatLoading(true);
    const system = `You are a hiring assistant. A recruiter is asking about a specific candidate for a job opening. Answer accurately using only information from the candidate's resume data. Be concise and specific.

JOB: ${job.title}
JOB DESCRIPTION: ${job.description}
REQUIREMENTS: ${job.requirements}

CANDIDATE DATA:
${JSON.stringify(selected, null, 2)}`;
    try {
      const reply = await callClaude(newChat, system, 600);
      setChat([...newChat, { role: "assistant", content: reply }]);
    } catch (e) { setChat([...newChat, { role: "assistant", content: "Sorry, I ran into an error. Please try again." }]); }
    setChatLoading(false);
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  async function generateEmail() {
    setEmailState("generating");
    const prompt = `Write a professional, warm, and concise interview invitation email to ${selected.name} for the position of ${job.title}.

Mention 1-2 specific things from their background that impressed the team: ${selected.strengths?.slice(0, 2).join("; ")}.

Ask them to reply to schedule a 30-minute intro call. Sign off as "The Hiring Team at [Company]".

Write only the email body, no subject line.`;
    try {
      const draft = await callClaude([{ role: "user", content: prompt }], "", 600);
      setEmailDraft(draft);
      setEmailState("editing");
    } catch (e) { setEmailState("idle"); alert("Failed to generate email."); }
  }

  // cutoff: top 40% if ≤10 resumes, top 20% if >10
  const cutoff = Math.max(1, Math.ceil(candidates.length * (candidates.length <= 10 ? 0.4 : 0.2)));
  const topCandidates = candidates.slice(0, cutoff);

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: HOME
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "home") return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      <Nav isLoggedIn={isLoggedIn} onLogin={() => setPage("login")} onLogout={() => { setIsLoggedIn(false); }} onHome={() => setPage("home")} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-16">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        </div>
        <h1 className="text-5xl font-extrabold text-gray-900 mb-3 tracking-tight">AI-Powered Hiring</h1>
        <p className="text-gray-500 text-xl max-w-md mb-10">Paste resumes. Get AI-ranked candidates with scores, summaries, and interview tools — in seconds.</p>
        <button onClick={() => setPage("job")} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-10 py-4 rounded-2xl shadow-lg text-lg transition hover:scale-105 active:scale-95">
          Create Job Listing →
        </button>
        <div className="mt-14 grid grid-cols-3 gap-8 max-w-lg text-sm text-gray-500">
          {[["📋","Define the role"],["📄","Paste resumes"],["🏆","AI ranks & scores"]].map(([icon,label]) => (
            <div key={label} className="flex flex-col items-center gap-2"><span className="text-3xl">{icon}</span><span>{label}</span></div>
          ))}
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: LOGIN
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "login") return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Nav isLoggedIn={isLoggedIn} onLogin={() => {}} onLogout={() => setIsLoggedIn(false)} onHome={() => setPage("home")} />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
          <p className="text-gray-400 text-sm mb-6">Access all candidates & profiles</p>
          <div className="flex flex-col gap-3">
            <input className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Email address" />
            <input type="password" className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Password" />
            <button onClick={handleLogin} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition">Sign in</button>
            <div className="relative flex items-center my-1"><div className="flex-1 border-t border-gray-100"/><span className="mx-3 text-xs text-gray-400">or</span><div className="flex-1 border-t border-gray-100"/></div>
            <button onClick={handleLogin} className="border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition">Continue with demo account</button>
          </div>
          <button onClick={() => setPage(candidates.length ? "results" : "home")} className="mt-5 w-full text-center text-xs text-gray-400 hover:text-gray-600">← Back</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: JOB FORM
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "job") return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Nav isLoggedIn={isLoggedIn} onLogin={() => setPage("login")} onLogout={() => setIsLoggedIn(false)} onHome={() => setPage("home")} />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">1</div>
            <div><h2 className="text-xl font-bold text-gray-900">Create Job Listing</h2><p className="text-xs text-gray-400">Step 1 of 2</p></div>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Title <span className="text-red-400">*</span></label>
              <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="e.g. Senior Software Engineer" value={job.title} onChange={e => setJob({...job, title: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Description <span className="text-red-400">*</span></label>
              <textarea rows={4} className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" placeholder="Describe the role, key responsibilities, day-to-day…" value={job.description} onChange={e => setJob({...job, description: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Requirements <span className="text-red-400">*</span></label>
              <textarea rows={3} className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" placeholder="Required skills, years of experience, education, certifications…" value={job.requirements} onChange={e => setJob({...job, requirements: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Culture & Fit</label>
              <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" placeholder="Values, team vibe, ideal personality traits, working style…" value={job.culture} onChange={e => setJob({...job, culture: e.target.value})} />
            </div>
            <button disabled={!job.title || !job.description || !job.requirements} onClick={() => setPage("upload")} className="mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 text-white font-bold py-3 rounded-xl transition text-sm">
              Next: Upload Resumes →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: UPLOAD
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "upload") {
    function onDrop(e) {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf" || f.name.endsWith(".txt") || f.name.endsWith(".doc") || f.name.endsWith(".docx"));
      if (!files.length) return alert("Please drop PDF or text files.");
      const synth = { target: { files, value: "" } };
      handleFileSelect(synth);
    }

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Nav isLoggedIn={isLoggedIn} onLogin={() => setPage("login")} onLogout={() => setIsLoggedIn(false)} onHome={() => setPage("home")} />
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">2</div>
              <div><h2 className="text-xl font-bold text-gray-900">Upload Resumes</h2><p className="text-xs text-gray-400">Step 2 of 2 — upload PDF files directly</p></div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-5 border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition ${dragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"}`}
            >
              <svg className="w-10 h-10 text-indigo-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              <p className="text-sm font-semibold text-gray-700 mb-1">Drag & drop resumes here</p>
              <p className="text-xs text-gray-400 mb-3">or click to browse — PDF, TXT supported</p>
              <span className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">Browse Files</span>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx" multiple className="hidden" onChange={handleFileSelect} />
            </div>

            {/* File list */}
            {resumeFiles.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 max-h-52 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{resumeFiles.length} file{resumeFiles.length !== 1 ? "s" : ""} queued</p>
                {resumeFiles.map(f => (
                  <div key={f.name} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                      </div>
                      <span className="text-sm text-gray-700 truncate max-w-xs">{f.name}</span>
                    </div>
                    <button onClick={() => removeFile(f.name)} className="text-xs text-red-400 hover:text-red-600 ml-3 shrink-0">Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setPage("job")} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition text-sm">← Back</button>
              <button disabled={loading || !resumeFiles.length} onClick={analyzeResumes} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 text-white font-bold py-2.5 rounded-xl transition text-sm">
                {loading ? analysisStatus || "Analyzing…" : `Analyze ${resumeFiles.length} Resume(s) →`}
              </button>
            </div>
            {loading && <div className="mt-4 flex justify-center"><Spinner label={analysisStatus} /></div>}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: RESULTS
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "results") {
    const allVisible = isLoggedIn ? candidates : topCandidates;
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Nav isLoggedIn={isLoggedIn} onLogin={() => setPage("login")} onLogout={() => setIsLoggedIn(false)} onHome={() => setPage("home")} />
        <div className="max-w-3xl mx-auto w-full px-4 py-8">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{job.title}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{candidates.length} candidate{candidates.length !== 1 ? "s" : ""} analyzed</p>
            </div>
            <button onClick={() => { setPage("upload"); }} className="text-xs text-indigo-500 hover:underline mt-1">+ Add more resumes</button>
          </div>

          <div className="flex gap-2 mt-3 mb-6 flex-wrap">
            <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">🏆 Top {Math.round((cutoff/candidates.length)*100)}% highlighted</span>
            {!isLoggedIn && <span className="text-xs bg-gray-100 text-gray-500 font-medium px-2.5 py-1 rounded-full">🔒 Log in to view all profiles</span>}
          </div>

          {/* Top candidates */}
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Top Candidates</h3>
          <div className="flex flex-col gap-2 mb-6">
            {topCandidates.map((c, i) => (
              <CandidateRow key={c.id} c={c} rank={i+1} isTop onClick={() => { setSelected(c); setChat([]); setEmailState("idle"); setEmailDraft(""); setPage("profile"); }} />
            ))}
          </div>

          {/* Rest */}
          {isLoggedIn && candidates.length > cutoff && (
            <>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">All Other Candidates</h3>
              <div className="flex flex-col gap-2 mb-6">
                {candidates.slice(cutoff).map((c, i) => (
                  <CandidateRow key={c.id} c={c} rank={cutoff+i+1} onClick={() => { setSelected(c); setChat([]); setEmailState("idle"); setEmailDraft(""); setPage("profile"); }} />
                ))}
              </div>
            </>
          )}

          {!isLoggedIn && candidates.length > cutoff && (
            <div className="border-2 border-dashed border-indigo-200 rounded-2xl p-7 text-center bg-white">
              <div className="text-3xl mb-2">🔒</div>
              <p className="text-indigo-800 font-bold text-lg mb-1">View All {candidates.length} Candidates</p>
              <p className="text-gray-400 text-sm mb-5">Sign in to unlock full rankings, detailed profiles, AI chat, and email tools.</p>
              <button onClick={() => requireLogin(() => setPage("results"))} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-2.5 rounded-xl transition shadow">Log in / Sign up</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: PROFILE
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "profile" && selected) {
    const c = selected;
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Nav isLoggedIn={isLoggedIn} onLogin={() => setPage("login")} onLogout={() => setIsLoggedIn(false)} onHome={() => setPage("home")} />
        <div className="max-w-2xl mx-auto w-full px-4 py-6">
          <button onClick={() => setPage("results")} className="text-sm text-indigo-500 hover:underline mb-4 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            Back to results
          </button>

          {/* Header card */}
          <div className="bg-white rounded-2xl shadow p-6 mb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow">
                  {c.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{c.name}</h2>
                  <p className="text-sm text-gray-400">{c.recent_role}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.phone && <span>📞 {c.phone}</span>}
                  </div>
                </div>
              </div>
              <ScorePill score={c.score} />
            </div>
            <p className="text-sm text-gray-500 italic mt-4 border-t border-gray-50 pt-4">{c.fit_summary}</p>
            {c.score_rationale && <p className="text-xs text-gray-400 mt-1">Score rationale: {c.score_rationale}</p>}

            {/* Skills */}
            {c.skills?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.skills.map(s => <span key={s} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{s}</span>)}
              </div>
            )}
          </div>

          {/* Strengths & weaknesses */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-2xl shadow p-4">
              <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-3">✅ Strengths</h4>
              <ul className="flex flex-col gap-2">
                {(c.strengths || []).map((s, i) => <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">•</span>{s}</li>)}
              </ul>
            </div>
            <div className="bg-white rounded-2xl shadow p-4">
              <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">⚠️ Gaps</h4>
              <ul className="flex flex-col gap-2">
                {(c.weaknesses || []).map((w, i) => <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-red-300 mt-0.5 shrink-0">•</span>{w}</li>)}
              </ul>
            </div>
          </div>

          {/* Email */}
          <div className="bg-white rounded-2xl shadow p-5 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">📧 Send Interview Request</h3>
            {emailState === "idle" && (
              <button onClick={generateEmail} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
                Generate Interview Email
              </button>
            )}
            {emailState === "generating" && <Spinner label="Drafting email…" />}
            {emailState === "editing" && (
              <div>
                <p className="text-xs text-gray-400 mb-2">To: <span className="text-gray-600">{c.email || "[no email found]"}</span></p>
                <textarea rows={9} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none mb-3 font-mono" value={emailDraft} onChange={e => setEmailDraft(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => setEmailState("sent")} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">Send Email ✓</button>
                  <button onClick={() => setEmailState("idle")} className="border border-gray-200 text-gray-500 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition">Discard</button>
                </div>
              </div>
            )}
            {emailState === "sent" && <p className="text-emerald-600 font-semibold text-sm">✅ Interview request sent to {c.email || c.name}</p>}
          </div>

          {/* Chat */}
          <div className="bg-white rounded-2xl shadow p-5">
            <h3 className="font-semibold text-gray-800 mb-3">💬 Ask AI About This Candidate</h3>
            <div className="flex flex-col gap-2 mb-3 min-h-16 max-h-64 overflow-y-auto">
              {chat.length === 0 && <p className="text-xs text-gray-400 italic">Ask anything — "How many years of Python experience do they have?" or "Would they be a good culture fit?"</p>}
              {chat.map((m, i) => (
                <div key={i} className={`text-sm px-3 py-2 rounded-2xl max-w-sm ${m.role === "user" ? "bg-indigo-600 text-white self-end" : "bg-gray-100 text-gray-800 self-start"}`}>
                  {m.content}
                </div>
              ))}
              {chatLoading && <div className="self-start"><Spinner label="Thinking…" /></div>}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Ask about this candidate…" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()} />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">Send</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function CandidateRow({ c, rank, isTop, onClick }) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between bg-white rounded-xl px-4 py-3.5 shadow-sm border cursor-pointer hover:shadow-md hover:border-indigo-200 transition group ${isTop ? "border-indigo-100" : "border-gray-100"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-bold text-gray-300 w-6 text-center shrink-0">#{rank}</span>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {c.name?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
          <p className="text-xs text-gray-400 truncate">{c.recent_role || c.fit_summary?.slice(0,55) || ""}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <ScorePill score={c.score} />
        <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
      </div>
    </div>
  );
}
