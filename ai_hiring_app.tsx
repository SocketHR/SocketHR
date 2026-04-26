"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSockethrRuntimeConfig } from "./src/lib/useSockethrRuntimeConfig";
import AppNav from "./src/components/hiring/AppNav";
import CandidatePortal from "./src/components/hiring/CandidatePortal";
import SimulationEditor from "./src/components/hiring/SimulationEditor";
import SimulationReportModal from "./src/components/hiring/SimulationReportModal";
import { safeCandidate, safeNum, safeStr, scorePillClass } from "./src/components/hiring/mockUtils";

function ScorePill({ score }: { score: any }) {
  const s = safeNum(score, 0);
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${scorePillClass(s)}`}>{s}/10</span>;
}

function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = { pending: "Not Tested", invited: "Invited", completed: "Tested" };
  return <span className="rounded border border-paper-line px-2 py-0.5 text-xs text-ink-faint">{label[status] || "Not Tested"}</span>;
}

export function HiringApp() {
  const { apiBase } = useSockethrRuntimeConfig();
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";
  const [hashToken] = useState(() => {
    try {
      const h = window.location.hash;
      const m = h.match(/[?&]?token=([a-z0-9]+)/i);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState("landing");
  const [job, setJob] = useState({ title: "", description: "", requirements: "", culture: "" });
  const [jobs, setJobs] = useState<any[]>([]);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [chat, setChat] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailState, setEmailState] = useState("idle");
  const [inviteLink, setInviteLink] = useState("");
  const [showSimEditor, setShowSimEditor] = useState(false);
  const [showSimReport, setShowSimReport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileRef = useRef<any>();

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return candidates;
    const q = searchQuery.toLowerCase();
    return candidates.filter((c) => safeStr(c.name).toLowerCase().includes(q) || safeStr(c.email).toLowerCase().includes(q));
  }, [candidates, searchQuery]);

  const fetchWithAuth = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const tokenRes = await fetch("/api/mac-token", { cache: "no-store" });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      const token = tokenRes.ok && typeof tokenJson?.token === "string" ? tokenJson.token : "";
      const base = apiBase.replace(/\/$/, "");
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      return data;
    },
    [apiBase]
  );

  useEffect(() => {
    if (!(window as any)._socketTokens) (window as any)._socketTokens = {};
    if (!(window as any)._socketResults) (window as any)._socketResults = {};
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const done = Object.entries((window as any)._socketResults || {});
      if (!done.length) return;
      done.forEach(([token, result]: any) => {
        const info = (window as any)._socketTokens?.[token];
        if (!info) return;
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === info.candidateId
              ? safeCandidate({
                  ...c,
                  score: safeNum(result.combinedScore, c.resumeScore),
                  simulationScore: safeNum(result.simulationScore),
                  testStatus: "completed",
                  assessmentStrengths: result.newStrengths || [],
                  assessmentGaps: result.newGaps || [],
                  assessmentSummary: result.assessmentSummary || "",
                  coachingNote: result.coachingNote || "",
                  integrityFlag: !!result.integrityFlag,
                  simulationReport: result.detailedReport || null,
                  questionBreakdown: result.questionBreakdown || [],
                })
              : c
          )
        );
        delete (window as any)._socketResults[token];
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  function generateToken(candidateId: any, candidateName: string, questions: any[]) {
    const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    (window as any)._socketTokens[token] = {
      candidateId,
      candidateName,
      jobTitle: job.title,
      questions,
      answered: false,
    };
    return token;
  }

  async function addFiles(rawFiles: any) {
    const valid = Array.from(rawFiles as FileList | File[]).filter(
      (f: any) => f.type === "application/pdf" || f.name.endsWith(".txt")
    ) as File[];
    const entries: any[] = [];
    for (const f of valid) {
      const data = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(f);
      });
      entries.push({ name: f.name, type: f.type, data });
    }
    setFiles((prev) => {
      const ex = new Set(prev.map((f) => f.name));
      return [...prev, ...entries.filter((e) => !ex.has(e.name))];
    });
  }

  async function analyzeResumes() {
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      const data = await fetchWithAuth("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          resumes: files.map((f) => ({ name: f.name, base64: f.data, type: f.type })),
          ...(activeJob?.id ? { existingJobId: activeJob.id } : {}),
        }),
      });
      const merged = Array.isArray(data?.candidates) ? data.candidates.map((c: any) => safeCandidate(c)) : [];
      const newJob = { id: data?.jobId || Date.now(), title: job.title, candidateCount: merged.length };
      setJobs((prev) => [newJob, ...prev.filter((j) => j.id !== newJob.id)]);
      setActiveJob(newJob);
      setCandidates(merged);
      setPage("ats");
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
    }
    setBusy(false);
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading || !selected) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgs = [...chat, { role: "user", content: msg }];
    setChat(msgs);
    setChatLoading(true);
    try {
      const data = await fetchWithAuth("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, selected, messages: msgs }),
      });
      setChat([...msgs, { role: "assistant", content: data?.reply || "No response." }]);
    } catch {
      setChat([...msgs, { role: "assistant", content: "Error - try again." }]);
    }
    setChatLoading(false);
  }

  async function genFollowupEmail() {
    if (!selected) return;
    setEmailState("generating");
    try {
      const data = await fetchWithAuth("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, selected }),
      });
      setEmailDraft(data?.draft || "");
      setEmailState("editing");
    } catch {
      setEmailState("idle");
    }
  }

  function sendWithQuestions(questions: any[]) {
    const c = selected;
    const token = generateToken(c.id, c.name, questions);
    const baseUrl = window.location.href.split("#")[0];
    const link = `${baseUrl}#token=${token}`;
    setInviteLink(link);
    setCandidates((prev) =>
      prev.map((x) => (x.id === c.id ? safeCandidate({ ...x, testStatus: "invited", inviteToken: token, generatedQuestions: questions }) : x))
    );
    setSelected((prev: any) => safeCandidate({ ...prev, testStatus: "invited", inviteToken: token, generatedQuestions: questions }));
    setShowSimEditor(false);
  }

  if (hashToken) return <CandidatePortal token={hashToken} />;

  if (page === "landing") {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <div className="mx-auto max-w-7xl px-8 py-6">
          <div className="flex items-center justify-between border-b border-paper-line pb-4">
            <span className="text-lg font-bold">SocketHR</span>
            <button type="button" onClick={() => setPage("login")} className="rounded-lg bg-accent/10 px-4 py-2 text-sm font-bold text-accent">
              Get started
            </button>
          </div>
          <div className="py-20 text-center">
            <h1 className="mb-6 text-5xl font-black tracking-tight">Don&apos;t ask what candidates have done. Simulate what they&apos;ll do.</h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-ink-muted">
              A clean, modern ATS that ranks resumes, runs candidate simulations, and helps you make better hiring decisions faster.
            </p>
            <button type="button" onClick={() => setPage("login")} className="rounded-xl bg-accent/10 px-8 py-4 text-base font-bold text-accent">
              Start hiring smarter
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (page === "login") {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <div className="cursor-pointer px-6 py-4 text-sm font-bold text-ink" onClick={() => setPage("landing")}>SocketHR</div>
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-paper-line bg-paper p-8">
            <h2 className="mb-1 text-2xl font-bold text-ink">Sign in</h2>
            <p className="mb-6 text-sm text-ink-faint">Access your hiring platform</p>
            <button type="button" onClick={() => signIn("google")} className="w-full rounded-lg bg-accent/10 py-2.5 font-bold text-accent">
              Continue with Google
            </button>
            <button type="button" onClick={() => setPage("onboard")} className="mt-3 w-full rounded-lg border border-paper-line py-2.5 text-sm text-ink">
              Continue with demo account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (page === "onboard") {
    return (
      <div className="min-h-screen bg-paper">
        <AppNav onHome={() => setPage("landing")} loggedIn={isLoggedIn} onLogout={() => signOut()} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <div className="mx-auto max-w-xl px-4 py-10">
          <div className="rounded-2xl border border-paper-line bg-paper p-8">
            <h2 className="mb-6 text-lg font-bold text-ink">Create Job Listing</h2>
            <div className="flex flex-col gap-4">
              <input className="rounded-lg border border-paper-line bg-paper px-4 py-2.5 text-sm" placeholder="Job title" value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} />
              <textarea rows={4} className="rounded-lg border border-paper-line bg-paper px-4 py-2.5 text-sm" placeholder="Job description" value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} />
              <textarea rows={3} className="rounded-lg border border-paper-line bg-paper px-4 py-2.5 text-sm" placeholder="Requirements" value={job.requirements} onChange={(e) => setJob({ ...job, requirements: e.target.value })} />
              <textarea rows={2} className="rounded-lg border border-paper-line bg-paper px-4 py-2.5 text-sm" placeholder="Culture & fit" value={job.culture} onChange={(e) => setJob({ ...job, culture: e.target.value })} />
              <button type="button" disabled={!job.title || !job.description || !job.requirements} onClick={() => setPage("upload")} className="rounded-xl bg-accent/10 py-3 text-sm font-bold text-accent disabled:opacity-50">
                Next: Upload Resumes
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (page === "upload") {
    return (
      <div className="min-h-screen bg-paper">
        <AppNav onHome={() => setPage("landing")} loggedIn={isLoggedIn} onLogout={() => signOut()} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="rounded-2xl border border-paper-line bg-paper p-8">
            <h2 className="mb-5 text-lg font-bold text-ink">Upload Resumes</h2>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-paper-line p-10 text-center"
            >
              <p className="text-sm text-ink-muted">Drag and drop PDF/TXT files here</p>
              <input ref={fileRef} type="file" accept=".pdf,.txt" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <div className="mt-4 flex max-h-48 flex-col gap-2 overflow-y-auto">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center justify-between rounded-xl border border-paper-line px-4 py-2.5">
                    <span className="truncate text-sm text-ink">{f.name}</span>
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))} className="text-xs text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            )}
            {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setPage("onboard")} className="flex-1 rounded-xl border border-paper-line py-2.5 text-sm text-ink">Back</button>
              <button type="button" disabled={busy || !files.length} onClick={analyzeResumes} className="flex-1 rounded-xl bg-accent/10 py-2.5 text-sm font-bold text-accent disabled:opacity-50">
                {busy ? "Analyzing..." : `Analyze ${files.length} Resume(s)`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (page === "ats") {
    return (
      <div className="min-h-screen bg-paper">
        <AppNav onHome={() => setPage("landing")} loggedIn={isLoggedIn} onLogout={() => signOut()} onNewJob={() => { setJob({ title: "", description: "", requirements: "", culture: "" }); setFiles([]); setPage("onboard"); }} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-sm font-bold text-ink">{searchQuery ? `Search: "${searchQuery}"` : activeJob?.title || "Candidates"}</h1>
              <p className="text-xs text-ink-faint">{filtered.length} candidate(s)</p>
            </div>
            <button type="button" onClick={() => setPage("upload")} className="rounded-lg bg-accent/10 px-4 py-2 text-xs font-bold text-accent">+ Upload Resumes</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-paper-line">
            <table className="w-full text-sm">
              <thead className="border-b border-paper-line bg-paper-line/10">
                <tr>
                  {["Candidate", "Role", "Resume", "Simulation", "Combined", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-b border-paper-line/60 hover:bg-paper-line/10" onClick={() => { setSelected(c); setPage("profile"); }}>
                    <td className="px-4 py-3 text-xs font-semibold text-ink">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{c.recent_role}</td>
                    <td className="px-4 py-3"><ScorePill score={c.resumeScore} /></td>
                    <td className="px-4 py-3">{c.simulationScore != null ? <ScorePill score={c.simulationScore} /> : <span className="text-xs text-ink-faint">-</span>}</td>
                    <td className="px-4 py-3"><ScorePill score={c.score} /></td>
                    <td className="px-4 py-3"><StatusPill status={c.testStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (page === "profile" && selected) {
    const c = candidates.find((x) => x.id === selected.id) || selected;
    return (
      <div className="min-h-screen bg-paper">
        <AppNav onHome={() => setPage("landing")} loggedIn={isLoggedIn} onLogout={() => signOut()} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        {showSimEditor && <SimulationEditor candidate={c} onClose={() => setShowSimEditor(false)} onSendWithQuestions={sendWithQuestions} />}
        {showSimReport && <SimulationReportModal candidate={c} onClose={() => setShowSimReport(false)} />}
        <div className="mx-auto max-w-3xl px-4 py-6">
          <button type="button" onClick={() => setPage("ats")} className="mb-5 text-xs text-ink-faint">Back to pipeline</button>
          <div className="mb-4 rounded-2xl border border-paper-line bg-paper p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-ink">{c.name}</h2>
                <p className="text-sm text-ink-muted">{c.recent_role}</p>
                <p className="mt-1 text-xs text-ink-faint">{c.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <ScorePill score={c.score} />
                <StatusPill status={c.testStatus} />
              </div>
            </div>
            <p className="mt-4 text-sm italic text-ink-muted">{c.fit_summary}</p>
          </div>

          <div className="mb-4 rounded-2xl border border-paper-line bg-paper p-5">
            <h3 className="mb-1 text-sm font-semibold text-ink">10-Minute Simulation</h3>
            <p className="mb-3 text-xs text-ink-faint">Review and send simulation to the candidate.</p>
            {c.testStatus !== "completed" ? (
              <button type="button" onClick={() => setShowSimEditor(true)} className="rounded-xl bg-accent/10 px-4 py-2 text-xs font-bold text-accent">
                Review & Send Simulation
              </button>
            ) : (
              <button type="button" onClick={() => setShowSimReport(true)} className="rounded-xl bg-accent/10 px-4 py-2 text-xs font-bold text-accent">
                View Simulation Report
              </button>
            )}
            {inviteLink && <p className="mt-3 break-all text-xs text-ink-faint">{inviteLink}</p>}
          </div>

          <div className="mb-4 rounded-2xl border border-paper-line bg-paper p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Send Email</h3>
            {emailState === "idle" && (
              <button type="button" onClick={genFollowupEmail} className="rounded-lg bg-accent/10 px-4 py-2 text-xs font-semibold text-accent">
                Generate Follow-up
              </button>
            )}
            {emailState === "generating" && <p className="text-sm text-ink-faint">Drafting...</p>}
            {emailState === "editing" && (
              <div>
                <textarea rows={8} className="mb-3 w-full rounded-xl border border-paper-line bg-paper-line/20 px-3 py-2 text-sm" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEmailState("sent")} className="rounded-lg bg-accent/10 px-4 py-2 text-sm font-bold text-accent">Send</button>
                  <button type="button" onClick={() => setEmailState("idle")} className="rounded-lg border border-paper-line px-4 py-2 text-sm text-ink">Discard</button>
                </div>
              </div>
            )}
            {emailState === "sent" && <p className="text-sm text-emerald-700">Sent to {c.email || c.name}</p>}
          </div>

          <div className="rounded-2xl border border-paper-line bg-paper p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Hiring Intelligence Chat</h3>
            <div className="mb-3 flex max-h-64 min-h-12 flex-col gap-2 overflow-y-auto">
              {chat.length === 0 && <p className="text-xs italic text-ink-faint">Ask anything about this candidate...</p>}
              {chat.map((m, i) => (
                <div key={i} className={`max-w-sm rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "self-end bg-accent/10 text-accent" : "self-start bg-paper-line/20 text-ink-muted"}`}>
                  {m.content}
                </div>
              ))}
              {chatLoading && <p className="text-xs text-ink-faint">Thinking...</p>}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-xl border border-paper-line bg-paper-line/20 px-3 py-2 text-sm" placeholder="Ask about this candidate..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
              <button type="button" onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="rounded-xl bg-accent/10 px-4 py-2 text-sm font-bold text-accent disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
