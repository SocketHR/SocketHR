import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { DEFAULT_API_BASE, useSockethrRuntimeConfig } from "./src/lib/useSockethrRuntimeConfig";

const RECRUITER_LOADING_TIPS = [
  "Tip: Ask how they handled their biggest failure — résumés rarely tell that story.",
  "Tip: The best hires often explain trade-offs, not just victories.",
  "Tip: If they ask great questions in the screen, note it. Curiosity scales.",
  "Tip: Culture fit isn't \"same personality\" — it's values and how they disagree.",
  "Tip: Red flag: vague ownership on team projects. Dig for what they actually shipped.",
  "Tip: Compare their stories to the job's hardest day, not the job description buzzwords.",
  "Tip: Reference checks: ask what they'd change if they hired this person again.",
  "Tip: Strong candidates can explain why they left without trashing the last place.",
  "Tip: Time-box take-home work — respect for your process starts in the interview.",
  "Tip: Note who follows up thoughtfully. It predicts how they'll treat candidates you pass on.",
  "Tip: Pair a technical question with \"what would you do if you were stuck for two days?\"",
  "Tip: Hiring is a forecast. Look for patterns across roles, not one shiny bullet.",
];

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Spinner({ label = "Processing…" }: { label?: string }) {
  return (
    <div className="flex items-start gap-3 font-ui text-sm text-ink-muted">
      <svg className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span className="max-w-md text-left leading-snug">{label}</span>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const bg =
    score >= 8
      ? "bg-emerald-100/80 text-emerald-900"
      : score >= 6
        ? "bg-sky-100/70 text-sky-900"
        : score >= 4
          ? "bg-amber-100/80 text-amber-900"
          : "bg-red-100/70 text-red-900";
  return <span className={`rounded-sm px-2 py-0.5 font-ui text-xs font-semibold tabular-nums ${bg}`}>{score}/10</span>;
}

function Nav({
  isLoggedIn,
  onLogin,
  onLogout,
  onHome,
  apiBase = DEFAULT_API_BASE,
  apiConfigLoaded = true,
}: {
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onHome: () => void;
  apiBase?: string;
  apiConfigLoaded?: boolean;
}) {
  const showLocalApiWarning =
    apiConfigLoaded &&
    typeof window !== "undefined" &&
    !/^localhost$/i.test(window.location.hostname) &&
    window.location.hostname !== "127.0.0.1" &&
    (apiBase.includes("127.0.0.1") || apiBase.includes("localhost"));

  return (
    <>
      {showLocalApiWarning && (
        <div className="border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 font-ui text-left text-xs text-amber-950">
          This site is configured to call a <strong>local</strong> API URL. Other devices on the network cannot reach that
          address. Set <code className="rounded bg-amber-100/80 px-1 font-mono text-[11px]">apiBase</code> in{" "}
          <code className="rounded bg-amber-100/80 px-1 font-mono text-[11px]">/runtime-config.json</code> on the server
          to your public HTTPS API (see docs/TROUBLESHOOTING_MOBILE.md).
        </div>
      )}
      <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-paper-line bg-paper-card/90 px-5 py-3 backdrop-blur-sm font-ui">
        <button type="button" className="flex cursor-pointer items-center gap-2.5 text-left" onClick={onHome}>
          <div className="flex h-8 w-8 items-center justify-center border border-paper-line bg-paper text-sm font-semibold text-accent">
            S
          </div>
          <span className="text-lg font-semibold tracking-tight text-ink">SocketHR</span>
        </button>
        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-paper-line bg-paper text-xs font-semibold text-accent">
              A
            </div>
            <span className="hidden text-sm text-ink-muted sm:block">Alex Johnson</span>
            <button type="button" onClick={onLogout} className="text-xs text-ink-faint transition hover:text-accent">
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            className="border border-paper-line bg-paper-card px-4 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:text-accent"
          >
            Log in
          </button>
        )}
      </nav>
    </>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export function HiringApp() {
  const { apiBase, configLoaded: apiConfigLoaded } = useSockethrRuntimeConfig();

  const postJson = useCallback(
    async (path: string, body: unknown) => {
      const base = apiBase.replace(/\/$/, "");
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `${path} failed (${res.status})`);
      return data;
    },
    [apiBase]
  );

  const [page, setPage] = useState("home");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [job, setJob] = useState({ title: "", description: "", requirements: "", culture: "" });
  const [resumeFiles, setResumeFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [candidates, setCandidates] = useState<
    { id?: string; name?: string; score?: number; recent_role?: string; fit_summary?: string; score_rationale?: string; skills?: string[]; strengths?: string[]; weaknesses?: string[]; email?: string; phone?: string }[]
  >([]);
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<(typeof candidates)[0] | null>(null);
  const [chat, setChat] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailState, setEmailState] = useState("idle"); // idle | generating | editing | sent
  const [dragging, setDragging] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  useEffect(() => {
    if (!loading) return;
    setLoadingTipIndex(0);
    const id = window.setInterval(() => {
      setLoadingTipIndex((i) => (i + 1) % RECRUITER_LOADING_TIPS.length);
    }, 3500);
    return () => window.clearInterval(id);
  }, [loading]);

  function requireLogin(nav: () => void) {
    if (isLoggedIn) {
      nav();
      return;
    }
    setPendingNav(() => nav);
    setPage("login");
  }

  function handleLogin() {
    setIsLoggedIn(true);
    if (pendingNav) {
      pendingNav();
      setPendingNav(null);
    } else setPage(candidates.length ? "results" : "home");
  }

  // ── File handling ─────────────────────────────────────────────────────────
  async function handleFileSelect(
    e: ChangeEvent<HTMLInputElement> | { target: { files: FileList | File[]; value: string } }
  ) {
    const raw = e.target.files;
    const files = Array.isArray(raw) ? raw : Array.from(raw ?? []);
    if (!files.length) return;
    const newFiles: { name: string; base64: string; type: string }[] = [];
    for (const file of files) {
      const base64 = await readFileAsBase64(file);
      newFiles.push({ name: file.name, base64, type: file.type });
    }
    setResumeFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
    });
    e.target.value = "";
  }

  function readFileAsBase64(file: File) {
    return new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        const url = r.result as string;
        res(url.split(",")[1]);
      };
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
  }

  function removeFile(name: string) {
    setResumeFiles((prev) => prev.filter((f) => f.name !== name));
  }

  // ── Core analysis ─────────────────────────────────────────────────────────
  async function analyzeResumes() {
    if (!resumeFiles.length) return alert("Please upload at least one resume.");
    setLoading(true);
    setCandidates([]);

    try {
      const { candidates: merged } = await postJson("/api/analyze", {
        job,
        resumes: resumeFiles.map((f) => ({ name: f.name, base64: f.base64, type: f.type })),
      });

      setCandidates(merged);
      setPage("results");
    } catch (err) {
      console.error(err);
      alert("Analysis failed: " + (err as Error).message);
    }
    setLoading(false);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newChat = [...chat, { role: "user", content: msg }];
    setChat(newChat);
    setChatLoading(true);
    try {
      const { reply } = await postJson("/api/chat", {
        job,
        selected,
        messages: newChat.map((m) => ({ role: m.role, content: m.content })),
      });
      setChat([...newChat, { role: "assistant", content: reply }]);
    } catch {
      setChat([...newChat, { role: "assistant", content: "Sorry, I ran into an error. Please try again." }]);
    }
    setChatLoading(false);
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  async function generateEmail() {
    setEmailState("generating");
    try {
      const { draft } = await postJson("/api/email", { job, selected });
      setEmailDraft(draft);
      setEmailState("editing");
    } catch {
      setEmailState("idle");
      alert("Failed to generate email.");
    }
  }

  const cutoff = Math.max(1, Math.ceil(candidates.length * (candidates.length <= 10 ? 0.4 : 0.2)));
  const topCandidates = candidates.slice(0, cutoff);

  const inputClass =
    "w-full border border-paper-line bg-paper-card px-3 py-2.5 font-ui text-sm text-ink placeholder:text-ink-faint/70 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25";
  const btnPrimary =
    "bg-accent font-ui text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40";
  const btnSecondary =
    "border border-paper-line bg-paper-card font-ui text-sm font-medium text-ink-muted transition hover:border-ink-faint/40 hover:text-ink";

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: HOME
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "home")
    return (
      <div className="hiring-shell flex flex-col">
        <Nav
          isLoggedIn={isLoggedIn}
          onLogin={() => setPage("login")}
          onLogout={() => {
            setIsLoggedIn(false);
          }}
          onHome={() => setPage("home")}
          apiBase={apiBase}
          apiConfigLoaded={apiConfigLoaded}
        />
        <div className="flex flex-1 flex-col px-6 py-14 sm:px-10">
          <div className="mx-auto w-full max-w-xl text-left">
            <p className="font-ui text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">Hiring workflow</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">AI-assisted hiring</h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-muted">
              Add resumes, get ranked candidates with scores and short summaries — then dig in with interview tools.
            </p>
            <button
              type="button"
              onClick={() => setPage("job")}
              className={`mt-10 px-8 py-3.5 ${btnPrimary}`}
            >
              Create job listing
            </button>
            <ul className="mt-14 space-y-4 border-t border-paper-line pt-10 font-ui text-sm text-ink-muted">
              <li className="flex gap-3">
                <span className="w-6 shrink-0 font-semibold text-accent">1</span>
                <span>Define the role and what good looks like.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 shrink-0 font-semibold text-accent">2</span>
                <span>Upload résumés (PDF or text).</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 shrink-0 font-semibold text-accent">3</span>
                <span>Review rankings, open profiles, draft outreach.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: LOGIN
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "login")
    return (
      <div className="hiring-shell flex flex-col">
        <Nav
          isLoggedIn={isLoggedIn}
          onLogin={() => {}}
          onLogout={() => setIsLoggedIn(false)}
          onHome={() => setPage("home")}
          apiBase={apiBase}
          apiConfigLoaded={apiConfigLoaded}
        />
        <div className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
          <div className="w-full max-w-sm border border-paper-line bg-paper-card p-8">
            <h2 className="text-2xl font-semibold text-ink">Sign in</h2>
            <p className="mt-1 font-ui text-sm text-ink-muted">Access all candidates and profiles</p>
            <div className="mt-6 flex flex-col gap-3">
              <input className={inputClass} placeholder="Email address" />
              <input className={inputClass} type="password" placeholder="Password" />
              <button type="button" onClick={handleLogin} className={`py-2.5 ${btnPrimary}`}>
                Sign in
              </button>
              <div className="relative my-1 flex items-center">
                <div className="flex-1 border-t border-paper-line" />
                <span className="mx-3 font-ui text-xs text-ink-faint">or</span>
                <div className="flex-1 border-t border-paper-line" />
              </div>
              <button type="button" onClick={handleLogin} className={`py-2.5 ${btnSecondary}`}>
                Continue with demo account
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPage(candidates.length ? "results" : "home")}
              className="mt-6 w-full text-left font-ui text-xs text-ink-faint transition hover:text-ink-muted"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: JOB FORM
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "job")
    return (
      <div className="hiring-shell flex flex-col">
        <Nav
          isLoggedIn={isLoggedIn}
          onLogin={() => setPage("login")}
          onLogout={() => setIsLoggedIn(false)}
          onHome={() => setPage("home")}
          apiBase={apiBase}
          apiConfigLoaded={apiConfigLoaded}
        />
        <div className="flex flex-1 justify-center px-4 py-10">
          <div className="w-full max-w-xl border border-paper-line bg-paper-card p-8">
            <div className="mb-6 flex items-start gap-3 text-left">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-paper-line bg-paper font-ui text-sm font-semibold text-accent">
                1
              </div>
              <div>
                <h2 className="text-xl font-semibold text-ink">Create job listing</h2>
                <p className="mt-0.5 font-ui text-xs text-ink-faint">Step 1 of 2</p>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block font-ui text-sm font-medium text-ink-muted">
                  Job title <span className="text-accent">*</span>
                </label>
                <input
                  className={inputClass}
                  placeholder="e.g. Senior Software Engineer"
                  value={job.title}
                  onChange={(e) => setJob({ ...job, title: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block font-ui text-sm font-medium text-ink-muted">
                  Job description <span className="text-accent">*</span>
                </label>
                <textarea
                  rows={4}
                  className={`${inputClass} resize-none`}
                  placeholder="Describe the role, key responsibilities, day-to-day…"
                  value={job.description}
                  onChange={(e) => setJob({ ...job, description: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block font-ui text-sm font-medium text-ink-muted">
                  Requirements <span className="text-accent">*</span>
                </label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Required skills, years of experience, education, certifications…"
                  value={job.requirements}
                  onChange={(e) => setJob({ ...job, requirements: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block font-ui text-sm font-medium text-ink-muted">Company culture and fit</label>
                <textarea
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Values, team vibe, ideal personality traits, working style…"
                  value={job.culture}
                  onChange={(e) => setJob({ ...job, culture: e.target.value })}
                />
              </div>
              <button
                type="button"
                disabled={!job.title || !job.description || !job.requirements}
                onClick={() => setPage("upload")}
                className={`mt-2 py-3 ${btnPrimary}`}
              >
                Next: upload résumés
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
    function onDrop(e: DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f: File) =>
          f.type === "application/pdf" || f.name.endsWith(".txt") || f.name.endsWith(".doc") || f.name.endsWith(".docx")
      );
      if (!files.length) return alert("Please drop PDF or text files.");
      const synth = { target: { files, value: "" } };
      handleFileSelect(synth);
    }

    return (
      <div className="hiring-shell flex flex-col">
        <Nav
          isLoggedIn={isLoggedIn}
          onLogin={() => setPage("login")}
          onLogout={() => setIsLoggedIn(false)}
          onHome={() => setPage("home")}
          apiBase={apiBase}
          apiConfigLoaded={apiConfigLoaded}
        />
        <div className="flex flex-1 justify-center px-4 py-10">
          <div className="w-full max-w-2xl border border-paper-line bg-paper-card p-8">
            <div className="mb-2 flex items-start gap-3 text-left">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-paper-line bg-paper font-ui text-sm font-semibold text-accent">
                2
              </div>
              <div>
                <h2 className="text-xl font-semibold text-ink">Upload résumés</h2>
                <p className="mt-0.5 font-ui text-xs text-ink-faint">Step 2 of 2 — PDF or text files</p>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-5 flex cursor-pointer flex-col items-center border-2 border-dashed p-10 transition ${
                dragging ? "border-accent/50 bg-accent-soft/40" : "border-paper-line hover:border-ink-faint/30 hover:bg-paper/80"
              }`}
            >
              <svg className="mb-3 h-10 w-10 text-ink-faint/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="font-ui text-sm font-medium text-ink">Drag and drop files here</p>
              <p className="mt-1 font-ui text-xs text-ink-faint">or click to browse — PDF, TXT supported</p>
              <span className={`mt-4 px-4 py-2 font-ui text-xs font-semibold text-white ${btnPrimary}`}>Browse files</span>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx" multiple className="hidden" onChange={handleFileSelect} />
            </div>

            {resumeFiles.length > 0 && (
              <div className="mt-4 flex max-h-52 flex-col gap-2 overflow-y-auto">
                <p className="font-ui text-xs font-medium uppercase tracking-wider text-ink-faint">
                  {resumeFiles.length} file{resumeFiles.length !== 1 ? "s" : ""} queued
                </p>
                {resumeFiles.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between border border-paper-line bg-paper px-4 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-paper-line bg-paper-card font-ui text-[10px] font-bold text-accent">
                        PDF
                      </div>
                      <span className="truncate font-ui text-sm text-ink">{f.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.name);
                      }}
                      className="ml-3 shrink-0 font-ui text-xs text-ink-faint transition hover:text-accent"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setPage("job")} className={`flex-1 py-2.5 ${btnSecondary}`}>
                ← Back
              </button>
              <button
                type="button"
                disabled={loading || !resumeFiles.length}
                onClick={analyzeResumes}
                className={`flex-1 py-2.5 ${btnPrimary}`}
              >
                {loading ? "Analyzing…" : `Analyze ${resumeFiles.length} résumé(s)`}
              </button>
            </div>
            {loading && (
              <div className="mt-5 border-t border-paper-line pt-5">
                <Spinner label={RECRUITER_LOADING_TIPS[loadingTipIndex]} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: RESULTS
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "results") {
    return (
      <div className="hiring-shell flex flex-col">
        <Nav
          isLoggedIn={isLoggedIn}
          onLogin={() => setPage("login")}
          onLogout={() => setIsLoggedIn(false)}
          onHome={() => setPage("home")}
          apiBase={apiBase}
          apiConfigLoaded={apiConfigLoaded}
        />
        <div className="mx-auto w-full max-w-3xl px-4 py-8 text-left">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-ink">{job.title}</h2>
              <p className="mt-0.5 font-ui text-sm text-ink-faint">
                {candidates.length} candidate{candidates.length !== 1 ? "s" : ""} analyzed
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPage("upload");
              }}
              className="shrink-0 font-ui text-xs text-accent transition hover:text-accent-hover"
            >
              + Add more résumés
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="border border-paper-line bg-paper px-2.5 py-1 font-ui text-xs font-medium text-ink-muted">
              Top {Math.round((cutoff / candidates.length) * 100)}% highlighted
            </span>
            {!isLoggedIn && (
              <span className="border border-paper-line bg-paper-card px-2.5 py-1 font-ui text-xs text-ink-faint">
                Sign in to view all profiles
              </span>
            )}
          </div>

          <h3 className="mb-3 mt-8 font-ui text-xs font-semibold uppercase tracking-widest text-ink-faint">Top candidates</h3>
          <div className="mb-6 flex flex-col gap-2">
            {topCandidates.map((c, i) => (
              <CandidateRow
                key={c.id ?? i}
                c={c}
                rank={i + 1}
                isTop
                onClick={() => {
                  setSelected(c);
                  setChat([]);
                  setEmailState("idle");
                  setEmailDraft("");
                  setPage("profile");
                }}
              />
            ))}
          </div>

          {isLoggedIn && candidates.length > cutoff && (
            <>
              <h3 className="mb-3 font-ui text-xs font-semibold uppercase tracking-widest text-ink-faint">All other candidates</h3>
              <div className="mb-6 flex flex-col gap-2">
                {candidates.slice(cutoff).map((c, i) => (
                  <CandidateRow
                    key={c.id ?? cutoff + i}
                    c={c}
                    rank={cutoff + i + 1}
                    onClick={() => {
                      setSelected(c);
                      setChat([]);
                      setEmailState("idle");
                      setEmailDraft("");
                      setPage("profile");
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {!isLoggedIn && candidates.length > cutoff && (
            <div className="border border-dashed border-paper-line bg-paper-card p-7 text-left">
              <p className="text-lg font-semibold text-ink">View all {candidates.length} candidates</p>
              <p className="mt-2 font-ui text-sm text-ink-muted">
                Sign in to unlock full rankings, detailed profiles, AI chat, and email tools.
              </p>
              <button
                type="button"
                onClick={() => requireLogin(() => setPage("results"))}
                className={`mt-5 px-6 py-2.5 ${btnPrimary}`}
              >
                Log in / Sign up
              </button>
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
      <div className="hiring-shell flex flex-col">
        <Nav
          isLoggedIn={isLoggedIn}
          onLogin={() => setPage("login")}
          onLogout={() => setIsLoggedIn(false)}
          onHome={() => setPage("home")}
          apiBase={apiBase}
          apiConfigLoaded={apiConfigLoaded}
        />
        <div className="mx-auto w-full max-w-2xl px-4 py-6 text-left">
          <button
            type="button"
            onClick={() => setPage("results")}
            className="mb-4 flex items-center gap-1 font-ui text-sm text-accent transition hover:text-accent-hover"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to results
          </button>

          <div className="mb-4 border border-paper-line bg-paper-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-paper-line bg-paper text-xl font-semibold text-accent">
                  {c.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-ink">{c.name}</h2>
                  <p className="mt-0.5 font-ui text-sm text-ink-muted">{c.recent_role}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-ui text-xs text-ink-faint">
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
              </div>
              <ScorePill score={c.score ?? 0} />
            </div>
            <p className="mt-4 border-t border-paper-line pt-4 text-sm italic leading-relaxed text-ink-muted">{c.fit_summary}</p>
            {c.score_rationale && (
              <p className="mt-2 font-ui text-xs text-ink-faint">Score rationale: {c.score_rationale}</p>
            )}

            {c.skills && c.skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.skills.map((s) => (
                  <span key={s} className="border border-paper-line bg-paper px-2 py-0.5 font-ui text-xs text-ink-muted">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="border border-paper-line bg-paper-card p-4">
              <h4 className="mb-3 font-ui text-xs font-semibold uppercase tracking-wider text-emerald-800">Strengths</h4>
              <ul className="flex flex-col gap-2">
                {(c.strengths || []).map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-muted">
                    <span className="mt-0.5 shrink-0 text-emerald-700">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-paper-line bg-paper-card p-4">
              <h4 className="mb-3 font-ui text-xs font-semibold uppercase tracking-wider text-red-800/90">Gaps</h4>
              <ul className="flex flex-col gap-2">
                {(c.weaknesses || []).map((w, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-muted">
                    <span className="mt-0.5 shrink-0 text-red-600/70">•</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mb-4 border border-paper-line bg-paper-card p-5">
            <h3 className="mb-3 font-semibold text-ink">Interview request email</h3>
            {emailState === "idle" && (
              <button type="button" onClick={generateEmail} className={`px-5 py-2 ${btnPrimary}`}>
                Generate draft
              </button>
            )}
            {emailState === "generating" && <Spinner label="Drafting email…" />}
            {emailState === "editing" && (
              <div>
                <p className="mb-2 font-ui text-xs text-ink-faint">
                  To: <span className="text-ink-muted">{c.email || "[no email found]"}</span>
                </p>
                <textarea
                  rows={9}
                  className={`${inputClass} mb-3 font-mono text-[13px] leading-relaxed`}
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEmailState("sent")} className={`px-5 py-2 ${btnPrimary}`}>
                    Send email
                  </button>
                  <button type="button" onClick={() => setEmailState("idle")} className={`px-4 py-2 ${btnSecondary}`}>
                    Discard
                  </button>
                </div>
              </div>
            )}
            {emailState === "sent" && (
              <p className="font-ui text-sm font-medium text-emerald-800">Interview request sent to {c.email || c.name}</p>
            )}
          </div>

          <div className="border border-paper-line bg-paper-card p-5">
            <h3 className="mb-3 font-semibold text-ink">Ask about this candidate</h3>
            <div className="mb-3 flex min-h-16 max-h-64 flex-col gap-2 overflow-y-auto">
              {chat.length === 0 && (
                <p className="font-ui text-xs italic text-ink-faint">
                  For example: years of experience with a stack, or how they might fit the team.
                </p>
              )}
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-sm px-3 py-2 text-sm ${
                    m.role === "user" ? "self-end bg-accent text-white" : "self-start border border-paper-line bg-paper text-ink-muted"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {chatLoading && (
                <div className="self-start">
                  <Spinner label="Thinking…" />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input
                className={`flex-1 ${inputClass}`}
                placeholder="Ask about this candidate…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className={`shrink-0 px-4 py-2 ${btnPrimary}`}
              >
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

type CandidateRowData = {
  name?: string;
  score?: number;
  recent_role?: string;
  fit_summary?: string;
};

function CandidateRow({
  c,
  rank,
  isTop = false,
  onClick,
}: {
  c: CandidateRowData;
  rank: number;
  isTop?: boolean;
  onClick: () => void;
}) {
  const summary = c.fit_summary && typeof c.fit_summary === "string" ? c.fit_summary.slice(0, 55) : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full cursor-pointer items-center justify-between border px-4 py-3.5 text-left transition hover:border-accent/35 ${
        isTop ? "border-paper-line bg-paper-card" : "border-paper-line bg-paper-card/80"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-6 shrink-0 text-center font-ui text-xs font-semibold text-ink-faint">#{rank}</span>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-paper-line bg-paper font-ui text-sm font-semibold text-accent">
          {c.name?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate font-ui text-sm font-medium text-ink">{c.name}</p>
          <p className="truncate font-ui text-xs text-ink-faint">{c.recent_role || summary || ""}</p>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-3">
        <ScorePill score={c.score ?? 0} />
        <svg
          className="h-4 w-4 text-ink-faint/50 transition group-hover:text-accent"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
