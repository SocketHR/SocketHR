"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { signIn, signOut, useSession } from "next-auth/react";
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

function buildInterviewMailto(opts: { to?: string; subject: string; body: string }): string {
  // Use encodeURIComponent (spaces → %20), not URLSearchParams (+), so mail clients show real spaces.
  const query = `subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`;
  const to = opts.to?.trim() ?? "";
  return to ? `mailto:${encodeURIComponent(to)}?${query}` : `mailto:?${query}`;
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Spinner({ label = "Processing…" }: { label?: string }) {
  return (
    <div className="flex items-start gap-3 font-ui text-sm text-ink-muted">
      <svg className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent/60" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span key={label} className="tip-fade max-w-md text-left leading-snug">{label}</span>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const style =
    score >= 8
      ? "bg-emerald-50/80 text-emerald-800"
      : score >= 6
        ? "bg-sky-50/80 text-sky-800"
        : score >= 4
          ? "bg-amber-50/80 text-amber-800"
          : "bg-red-50/80 text-red-800";
  return <span className={`rounded-full px-2.5 py-0.5 font-ui text-xs font-semibold tabular-nums ${style}`}>{score}/10</span>;
}

/** Two-step flow: visual progress only (no “Step N of M” copy). */
function WizardProgress({ step, total = 2 }: { step: number; total?: number }) {
  const pct = (step / total) * 100;
  return (
    <div
      className="mb-6"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${step} of ${total}`}
    >
      <div className="h-1 overflow-hidden rounded-full bg-paper-line/35">
        <div
          className="h-full rounded-full bg-accent/40 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Nav({
  isLoggedIn,
  userName,
  onLogin,
  onLogout,
  onHome,
  apiBase = DEFAULT_API_BASE,
  apiConfigLoaded = true,
}: {
  isLoggedIn: boolean;
  userName?: string | null;
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
        <div className="bg-amber-50/60 px-6 py-2.5 font-ui text-left text-xs text-amber-900/80 sm:px-10">
          This site is configured to call a <strong>local</strong> API URL. Other devices cannot reach it.
          Set <code className="rounded bg-amber-100/50 px-1 font-mono text-[11px]">apiBase</code> in{" "}
          <code className="rounded bg-amber-100/50 px-1 font-mono text-[11px]">/runtime-config.json</code> to your public
          HTTPS API.
        </div>
      )}
      <nav className="sticky top-0 z-10 flex items-center justify-between bg-paper/90 px-6 py-4 backdrop-blur-sm font-ui sm:px-10">
        <button type="button" className="flex cursor-pointer items-center gap-2 text-left transition-opacity duration-150 hover:opacity-60" onClick={onHome}>
          <span className="text-lg font-bold tracking-tight text-ink">SocketHR</span>
        </button>
        {isLoggedIn ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:block">{userName || "Signed in"}</span>
            <button type="button" onClick={onLogout} className="rounded-lg px-2 py-1 text-xs text-ink-faint transition-colors duration-150 hover:text-ink-muted">
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-faint transition-all duration-150 hover:bg-paper-line/25 hover:text-ink-muted"
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
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const userName = session?.user?.name ?? session?.user?.email ?? null;

  const postJson = useCallback(
    async (path: string, body: unknown) => {
      const tokenRes = await fetch("/api/mac-token", { cache: "no-store" });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      const token =
        tokenRes.ok && typeof (tokenJson as { token?: unknown }).token === "string"
          ? (tokenJson as { token: string }).token
          : "";
      const base = apiBase.replace(/\/$/, "");
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `${path} failed (${res.status})`);
      return data;
    },
    [apiBase]
  );

  const [page, setPage] = useState("home");
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
  const [emailState, setEmailState] = useState("idle");
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
    }, 17500);
    return () => window.clearInterval(id);
  }, [loading]);

  function requireLogin(nav: () => void) {
    if (isLoggedIn) { nav(); return; }
    setPendingNav(() => nav);
    setPage("login");
  }

  function handleLogin() {
    signIn("google");
  }

  useEffect(() => {
    if (!isLoggedIn) return;
    if (pendingNav) { pendingNav(); setPendingNav(null); }
    else setPage(candidates.length ? "results" : "home");
  }, [isLoggedIn, pendingNav, candidates.length]);

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
      r.onload = () => { res((r.result as string).split(",")[1]); };
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
  }

  function removeFile(name: string) {
    setResumeFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function analyzeResumes() {
    if (!resumeFiles.length) return alert("Please upload at least one resume.");
    if (!isLoggedIn) {
      setPage("login");
      return alert("Sign in with Google to analyze resumes.");
    }
    setLoading(true);
    setCandidates([]);
    try {
      const { candidates: merged, storage } = await postJson("/api/analyze", {
        job,
        resumes: resumeFiles.map((f) => ({ name: f.name, base64: f.base64, type: f.type })),
      });
      setCandidates(merged);
      const skippedCount = Number((storage as { skippedCount?: number } | undefined)?.skippedCount || 0);
      if (skippedCount > 0) {
        alert(`${skippedCount} resume(s) were ranked but not stored because no applicant email was detected.`);
      }
      setPage("results");
    } catch (err) {
      console.error(err);
      alert("Analysis failed: " + (err as Error).message);
    }
    setLoading(false);
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newChat = [...chat, { role: "user", content: msg }];
    setChat(newChat);
    setChatLoading(true);
    try {
      const { reply } = await postJson("/api/chat", {
        job, selected,
        messages: newChat.map((m) => ({ role: m.role, content: m.content })),
      });
      setChat([...newChat, { role: "assistant", content: reply }]);
    } catch {
      setChat([...newChat, { role: "assistant", content: "Sorry, I ran into an error. Please try again." }]);
    }
    setChatLoading(false);
  }

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

  function openInterviewInMailApp() {
    const subject = job.title.trim() ? `Interview opportunity: ${job.title.trim()}` : "Interview opportunity";
    const href = buildInterviewMailto({
      to: selected?.email,
      subject,
      body: emailDraft,
    });
    window.location.href = href;
  }

  const cutoff = Math.max(1, Math.ceil(candidates.length * (candidates.length <= 10 ? 0.4 : 0.2)));
  const topCandidates = candidates.slice(0, cutoff);

  const inputClass =
    "w-full rounded-lg bg-paper-line/20 px-3.5 py-2.5 font-ui text-sm text-ink placeholder:text-ink-faint/50 transition-colors duration-150 focus:bg-paper-line/30 focus:outline-none";
  const btnPrimary =
    "rounded-lg bg-accent/10 font-ui text-sm font-semibold text-accent transition-all duration-150 hover:bg-accent/[0.16] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30";
  const btnSecondary =
    "rounded-lg bg-paper-line/20 font-ui text-sm font-medium text-ink-muted transition-all duration-150 hover:bg-paper-line/35 hover:text-ink active:scale-[0.98]";

  const shell = "hiring-shell flex flex-col";
  const content = "fade-in-up mx-auto w-full max-w-2xl px-6 py-10 text-left sm:px-10";

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: HOME
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "home")
    return (
      <div className={shell}>
        <Nav isLoggedIn={isLoggedIn} userName={userName} onLogin={() => setPage("login")} onLogout={() => signOut()} onHome={() => setPage("home")} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        <div className={content}>
          <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-ink sm:text-6xl">AI-assisted<br />hiring</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-muted">
            Add resumes, get ranked candidates with scores and summaries — then dig in with interview tools.
          </p>
          <button type="button" onClick={() => setPage("job")} className={`mt-10 px-7 py-3 ${btnPrimary}`}>
            Create job listing
          </button>
        </div>
      </div>
    );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: LOGIN
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "login")
    return (
      <div className={shell}>
        <Nav isLoggedIn={isLoggedIn} userName={userName} onLogin={() => {}} onLogout={() => signOut()} onHome={() => setPage("home")} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        <div className={content} style={{ maxWidth: "24rem" }}>
          <h2 className="text-3xl font-bold tracking-tight text-ink">Sign in</h2>
          <div className="mt-8 flex flex-col gap-3">
            <p className="font-ui text-sm text-ink-muted">Continue with your Google account to access resume analysis.</p>
            <button type="button" onClick={handleLogin} className={`py-2.5 ${btnPrimary}`}>Continue with Google</button>
          </div>
          <button
            type="button"
            onClick={() => setPage(candidates.length ? "results" : "home")}
            className="mt-8 font-ui text-xs text-ink-faint transition-colors duration-150 hover:text-ink-muted"
          >
            ← Back
          </button>
        </div>
      </div>
    );

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: JOB FORM
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "job")
    return (
      <div className={shell}>
        <Nav isLoggedIn={isLoggedIn} userName={userName} onLogin={() => setPage("login")} onLogout={() => signOut()} onHome={() => setPage("home")} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        <div className={content}>
          <WizardProgress step={1} />
          <h2 className="text-3xl font-bold tracking-tight text-ink">Create job listing</h2>
          <div className="mt-8 flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block font-ui text-sm font-medium text-ink-muted">Job title <span className="text-accent/60">*</span></label>
              <input className={inputClass} placeholder="e.g. Senior Software Engineer" value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block font-ui text-sm font-medium text-ink-muted">Job description <span className="text-accent/60">*</span></label>
              <textarea rows={4} className={`${inputClass} resize-none`} placeholder="Describe the role, key responsibilities, day-to-day…" value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block font-ui text-sm font-medium text-ink-muted">Requirements <span className="text-accent/60">*</span></label>
              <textarea rows={3} className={`${inputClass} resize-none`} placeholder="Required skills, years of experience, education, certifications…" value={job.requirements} onChange={(e) => setJob({ ...job, requirements: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block font-ui text-sm font-medium text-ink-muted">Company culture and fit</label>
              <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Values, team vibe, ideal personality traits, working style…" value={job.culture} onChange={(e) => setJob({ ...job, culture: e.target.value })} />
            </div>
            <button
              type="button"
              disabled={!job.title || !job.description || !job.requirements}
              onClick={() => setPage("upload")}
              className={`mt-1 py-3 ${btnPrimary}`}
            >
              Continue
            </button>
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
        (f: File) => f.type === "application/pdf" || f.name.endsWith(".txt") || f.name.endsWith(".doc") || f.name.endsWith(".docx")
      );
      if (!files.length) return alert("Please drop PDF or text files.");
      handleFileSelect({ target: { files, value: "" } });
    }

    return (
      <div className={shell}>
        <Nav isLoggedIn={isLoggedIn} userName={userName} onLogin={() => setPage("login")} onLogout={() => signOut()} onHome={() => setPage("home")} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        <div className={content}>
          <WizardProgress step={2} />
          <h2 className="text-3xl font-bold tracking-tight text-ink">Upload résumés</h2>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
            aria-label="Upload résumés: drop PDF or text files, or click to choose files."
            className={`mt-8 flex cursor-pointer flex-col items-center rounded-xl py-14 transition-all duration-200 ${
              dragging ? "bg-accent-soft/30" : "bg-paper-line/15 hover:bg-paper-line/25"
            }`}
          >
            <svg className="h-10 w-10 text-ink-faint/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx" multiple className="hidden" onChange={handleFileSelect} />
          </div>

          {resumeFiles.length > 0 && (
            <div className="mt-6 flex max-h-52 flex-col gap-1 overflow-y-auto">
              {resumeFiles.map((f) => (
                <div key={f.name} className="flex items-center justify-between rounded-lg py-2 transition-colors duration-150 hover:bg-paper-line/15">
                  <div className="flex min-w-0 items-center gap-3 pl-1">
                    <span className="truncate font-ui text-sm text-ink">{f.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                    className="ml-3 shrink-0 rounded-md px-2 py-1 font-ui text-xs text-ink-faint transition-colors duration-150 hover:text-ink-muted"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setPage("job")} className={`flex-1 py-2.5 ${btnSecondary}`}>← Back</button>
            <button type="button" disabled={loading || !resumeFiles.length} onClick={analyzeResumes} className={`flex-1 py-2.5 ${btnPrimary}`}>
              {loading ? "Analyzing…" : `Analyze ${resumeFiles.length} résumé(s)`}
            </button>
          </div>
          {loading && (
            <div className="mt-6">
              <Spinner label={RECRUITER_LOADING_TIPS[loadingTipIndex]} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: RESULTS
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "results") {
    return (
      <div className={shell}>
        <Nav isLoggedIn={isLoggedIn} userName={userName} onLogin={() => setPage("login")} onLogout={() => signOut()} onHome={() => setPage("home")} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        <div className="fade-in-up mx-auto w-full max-w-3xl px-6 py-10 text-left sm:px-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-3xl font-bold tracking-tight text-ink">{job.title}</h2>
            <button type="button" onClick={() => setPage("upload")} className="shrink-0 rounded-lg px-2.5 py-1.5 font-ui text-sm text-accent/85 transition-colors duration-150 hover:bg-accent/5 hover:text-accent">
              Add résumés
            </button>
          </div>

          <div className="mt-10 flex flex-col">
            {topCandidates.map((c, i) => (
              <CandidateRow key={c.id ?? i} c={c} rank={i + 1} isTop onClick={() => { setSelected(c); setChat([]); setEmailState("idle"); setEmailDraft(""); setPage("profile"); }} />
            ))}
          </div>

          {isLoggedIn && candidates.length > cutoff && (
            <>
              <div className="my-8 h-px bg-paper-line/40" aria-hidden />
              <div className="mb-8 flex flex-col">
                {candidates.slice(cutoff).map((c, i) => (
                  <CandidateRow key={c.id ?? cutoff + i} c={c} rank={cutoff + i + 1} onClick={() => { setSelected(c); setChat([]); setEmailState("idle"); setEmailDraft(""); setPage("profile"); }} />
                ))}
              </div>
            </>
          )}

          {!isLoggedIn && candidates.length > cutoff && (
            <div className="mt-10">
              <button type="button" onClick={() => requireLogin(() => setPage("results"))} className={`px-6 py-2.5 ${btnPrimary}`}>
                View all {candidates.length} — sign in
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
      <div className={shell}>
        <Nav isLoggedIn={isLoggedIn} userName={userName} onLogin={() => setPage("login")} onLogout={() => signOut()} onHome={() => setPage("home")} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        <div className={content}>
          <button
            type="button"
            onClick={() => setPage("results")}
            aria-label="Back to results"
            className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint transition-colors duration-150 hover:bg-paper-line/25 hover:text-ink-muted"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/10 text-lg font-semibold text-accent">
              {c.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-bold tracking-tight text-ink">{c.name}</h2>
                <ScorePill score={c.score ?? 0} />
              </div>
              <p className="mt-0.5 font-ui text-sm text-ink-muted">{c.recent_role}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-ui text-xs text-ink-faint">
                {c.email && <span>{c.email}</span>}
                {c.phone && <span>{c.phone}</span>}
              </div>
            </div>
          </div>

          <p className="mt-6 text-[15px] italic leading-relaxed text-ink-muted">{c.fit_summary}</p>
          {c.score_rationale && <p className="mt-2 text-sm text-ink-muted">{c.score_rationale}</p>}

          {c.skills && c.skills.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {c.skills.map((s) => (
                <span key={s} className="rounded-full bg-paper-line/25 px-2.5 py-0.5 font-ui text-xs text-ink-muted">{s}</span>
              ))}
            </div>
          )}

          {/* Strengths & Gaps */}
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Strengths</p>
              <ul className="flex flex-col gap-2">
                {(c.strengths || []).map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                    <span className="mt-1 shrink-0 text-emerald-600/50">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Gaps</p>
              <ul className="flex flex-col gap-2">
                {(c.weaknesses || []).map((w, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                    <span className="mt-1 shrink-0 text-red-500/40">•</span>{w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Email */}
          <div className="mt-10">
            {emailState === "idle" && (
              <button type="button" onClick={generateEmail} className={`px-5 py-2 ${btnPrimary}`}>Generate interview email</button>
            )}
            {emailState === "generating" && <Spinner label="Drafting email…" />}
            {emailState === "editing" && (
              <div>
                <p className="sr-only">Recipient: {c.email || "address not on file"}</p>
                <textarea
                  rows={9}
                  className={`${inputClass} mb-3 font-mono text-[13px] leading-relaxed`}
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openInterviewInMailApp} className={`px-5 py-2 ${btnPrimary}`}>
                    Open in email app
                  </button>
                  <button type="button" onClick={() => setEmailState("idle")} className={`px-4 py-2 ${btnSecondary}`}>Discard</button>
                </div>
              </div>
            )}
          </div>

          {/* Chat */}
          <div className="mt-10">
            <div className="flex min-h-12 max-h-64 flex-col gap-2 overflow-y-auto" aria-label="Chat about candidate">
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === "user"
                      ? "self-end bg-accent/10 text-accent"
                      : "self-start bg-paper-line/20 text-ink-muted"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {chatLoading && <div className="self-start"><Spinner label="Thinking…" /></div>}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={`flex-1 ${inputClass}`}
                placeholder="Ask the assistant…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
              />
              <button type="button" onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className={`shrink-0 px-4 py-2 ${btnPrimary}`}>
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
      className={`group flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-3 text-left transition-all duration-150 hover:bg-paper-line/15 active:scale-[0.998] ${
        isTop ? "" : "opacity-90"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-5 shrink-0 font-ui text-xs font-semibold text-ink-faint/60">{rank}</span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/8 font-ui text-sm font-semibold text-accent/80">
          {c.name?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate font-ui text-sm font-medium text-ink">{c.name}</p>
          <p className="truncate font-ui text-xs text-ink-faint">{c.recent_role || summary || ""}</p>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2.5">
        <ScorePill score={c.score ?? 0} />
        <svg className="h-3.5 w-3.5 text-ink-faint/30 transition-colors duration-150 group-hover:text-ink-faint/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
