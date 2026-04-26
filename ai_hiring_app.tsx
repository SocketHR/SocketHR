"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";
import { DEFAULT_API_BASE, useSockethrRuntimeConfig } from "./src/lib/useSockethrRuntimeConfig";

type JobSpec = { title: string; description: string; requirements: string; culture: string };
type SavedListing = { jobId: string; title: string; candidateCount: number; updatedAt: string };
type SimulationQuestion = {
  type: "case_unfolding" | "prioritization" | "multiple_choice" | "short_answer" | "written";
  scenario?: string;
  question?: string;
  options?: string[];
  items?: string[];
  phase1_situation?: string;
  phase1_question?: string;
  phase2_reveal?: string;
  phase2_question?: string;
};
type Candidate = {
  id?: string | number;
  name?: string;
  email?: string;
  phone?: string;
  recent_role?: string;
  raw_summary?: string;
  education?: string;
  skills?: string[];
  score?: number;
  resumeScore?: number;
  simulationScore?: number | null;
  score_rationale?: string;
  strengths?: string[];
  weaknesses?: string[];
  fit_summary?: string;
  testStatus?: "pending" | "invited" | "completed";
  hireStatus?: "none" | "considering" | "hired" | "rejected";
  generatedQuestions?: SimulationQuestion[];
  simulationReport?: Record<string, unknown> | null;
  assessmentStrengths?: string[];
  assessmentGaps?: string[];
  assessmentSummary?: string;
  coachingNote?: string;
  questionBreakdown?: Array<{ questionId?: number; score?: number; feedback?: string }>;
  manualRank?: number | null;
  interviewNotes?: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewSummary?: string;
  integrityFlag?: boolean;
};

const loadingTips = [
  "Reading resumes and extracting candidate evidence.",
  "Scoring candidates against the actual role requirements.",
  "Looking for signal beyond keyword matches.",
  "Building a ranked pipeline you can inspect.",
];

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-4">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

function safeArr(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x ?? "")).filter(Boolean);
  if (typeof value === "string") return value.split("\n").map((x) => x.trim()).filter(Boolean);
  return [];
}

function safeScore(value: unknown, fallback = 5) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : fallback;
}

function normalizeCandidate(candidate: Candidate): Candidate {
  const resumeScore = safeScore(candidate.resumeScore ?? candidate.score);
  const score = safeScore(candidate.score ?? resumeScore);
  return {
    ...candidate,
    name: candidate.name || "Unknown",
    score,
    resumeScore,
    simulationScore: candidate.simulationScore == null ? null : safeScore(candidate.simulationScore),
    skills: safeArr(candidate.skills),
    strengths: safeArr(candidate.strengths),
    weaknesses: safeArr(candidate.weaknesses),
    assessmentStrengths: safeArr(candidate.assessmentStrengths),
    assessmentGaps: safeArr(candidate.assessmentGaps),
    testStatus: candidate.testStatus || "pending",
    hireStatus: candidate.hireStatus || "none",
    generatedQuestions: Array.isArray(candidate.generatedQuestions) ? candidate.generatedQuestions : [],
    questionBreakdown: Array.isArray(candidate.questionBreakdown) ? candidate.questionBreakdown : [],
    simulationReport: candidate.simulationReport || null,
    manualRank: candidate.manualRank ?? null,
  };
}

function normalizeJobTitle(title: string) {
  return String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildMailto(opts: { to?: string; subject: string; body: string }) {
  const to = opts.to?.trim() ?? "";
  const query = `subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`;
  return to ? `mailto:${encodeURIComponent(to)}?${query}` : `mailto:?${query}`;
}

function Spinner({ label = "Processing..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 font-ui text-sm text-ink-muted">
      <svg className="h-4 w-4 animate-spin text-accent/70" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

function ScorePill({ score }: { score?: number | null }) {
  if (score == null) return <span className="font-ui text-xs text-ink-faint">-</span>;
  const s = safeScore(score);
  const style =
    s >= 8 ? "bg-emerald-50 text-emerald-800" :
    s >= 6 ? "bg-sky-50 text-sky-800" :
    s >= 4 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800";
  return <span className={`rounded-full px-2.5 py-1 font-ui text-xs font-bold tabular-nums ${style}`}>{s}/10</span>;
}

function StatusPill({ status }: { status?: Candidate["testStatus"] }) {
  const labels = { pending: "Not tested", invited: "Invited", completed: "Tested" };
  const style =
    status === "completed" ? "bg-emerald-50 text-emerald-800" :
    status === "invited" ? "bg-amber-50 text-amber-800" : "bg-paper-line/30 text-ink-faint";
  return <span className={`rounded-full px-2.5 py-1 font-ui text-xs font-semibold ${style}`}>{labels[status || "pending"]}</span>;
}

function HireBadge({ status }: { status?: Candidate["hireStatus"] }) {
  if (!status || status === "none") return null;
  const style =
    status === "hired" ? "bg-emerald-600 text-white" :
    status === "rejected" ? "bg-red-50 text-red-800" : "bg-accent-soft text-accent";
  return <span className={`rounded-full px-2.5 py-1 font-ui text-xs font-bold ${style}`}>{status}</span>;
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

function AppNav({
  loggedIn,
  userName,
  onHome,
  onLogin,
  onLogout,
  onNewJob,
  searchQuery,
  setSearchQuery,
  apiBase,
  apiConfigLoaded,
}: {
  loggedIn: boolean;
  userName?: string | null;
  onHome: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onNewJob?: () => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  apiBase: string;
  apiConfigLoaded: boolean;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const showLocalApiWarning =
    apiConfigLoaded &&
    typeof window !== "undefined" &&
    !/^localhost$/i.test(window.location.hostname) &&
    window.location.hostname !== "127.0.0.1" &&
    (apiBase.includes("127.0.0.1") || apiBase.includes("localhost"));

  return (
    <>
      {showLocalApiWarning && (
        <div className="bg-amber-50/70 px-6 py-2.5 font-ui text-xs text-amber-900 sm:px-10">
          This site is configured to call a local API URL. Set apiBase in runtime-config.json for public access.
        </div>
      )}
      <nav className="sticky top-0 z-20 flex items-center justify-between border-b border-paper-line/60 bg-paper/90 px-5 py-3 font-ui backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" onClick={onHome} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-sm font-black text-paper-card">S</span>
            <span className="font-ui text-sm font-black tracking-tight text-ink">SocketHR</span>
          </button>
          <div className="hidden sm:block">
            {showSearch ? (
              <input
                autoFocus
                className="w-64 rounded-xl border border-paper-line bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent/40"
                placeholder="Search candidates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => !searchQuery && setShowSearch(false)}
              />
            ) : (
              <button type="button" onClick={() => setShowSearch(true)} className="rounded-lg px-2 py-1.5 text-xs text-ink-faint hover:bg-paper-line/25 hover:text-ink-muted">
                Search
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onNewJob && <button type="button" onClick={onNewJob} className="text-xs font-semibold text-accent hover:text-accent-hover">+ New job</button>}
          {loggedIn ? (
            <>
              <span className="hidden text-xs text-ink-faint sm:block">{userName || "Signed in"}</span>
              <button type="button" onClick={onLogout} className="text-xs text-ink-faint hover:text-ink">Sign out</button>
            </>
          ) : (
            <button type="button" onClick={onLogin} className="text-xs font-semibold text-ink-muted hover:text-ink">Sign in</button>
          )}
        </div>
      </nav>
    </>
  );
}

function CandidatePortal({ token, apiBase }: { token: string; apiBase: string }) {
  const [invite, setInvite] = useState<{ candidateName: string; jobTitle: string; questions: SimulationQuestion[]; answered?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"welcome" | "questions" | "done">("welcome");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [casePhase, setCasePhase] = useState(1);
  const [caseAns1, setCaseAns1] = useState("");
  const [caseAns2, setCaseAns2] = useState("");
  const [ranking, setRanking] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(600);
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    fetch(`${apiBase.replace(/\/$/, "")}/api/simulations/invite/${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setInvite(data);
          if (data.answered) setStep("done");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase, token]);

  useEffect(() => {
    if (step !== "questions") return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(id);
          void submitAnswers();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    setCasePhase(1);
    setCaseAns1("");
    setCaseAns2("");
    setRanking([]);
  }, [currentQ]);

  if (loading) {
    return <div className="hiring-shell flex min-h-screen items-center justify-center"><Spinner label="Loading assessment..." /></div>;
  }
  if (!invite) {
    return (
      <div className="hiring-shell flex min-h-screen items-center justify-center px-4">
        <div className="rounded-3xl border border-paper-line bg-paper-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-ink">Link not found</h1>
          <p className="mt-2 font-ui text-sm text-ink-muted">This assessment link is invalid or expired.</p>
        </div>
      </div>
    );
  }

  const questions = invite.questions || [];
  const q = questions[currentQ];
  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, "0");
  const canProceed =
    !q ? false :
    q.type === "case_unfolding" ? casePhase === 2 && caseAns2.trim().length > 0 :
    q.type === "prioritization" ? ranking.length === safeArr(q.items).length :
    Boolean(answers[currentQ]);

  function setCaseTwo(value: string) {
    setCaseAns2(value);
    setAnswers((prev) => ({
      ...prev,
      [currentQ]: `Phase 1 Response:\n${caseAns1}\n\nSituation Update: ${q?.phase2_reveal || ""}\n\nPhase 2 Response:\n${value}`,
    }));
  }

  function toggleRank(index: number) {
    const next = ranking.includes(index) ? ranking.filter((x) => x !== index) : [...ranking, index];
    setRanking(next);
    const items = safeArr(q?.items);
    setAnswers((prev) => ({ ...prev, [currentQ]: next.map((i, r) => `${r + 1}. ${items[i]}`).join("\n") }));
  }

  async function submitAnswers() {
    if (submitted.current || !invite) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      await fetch(`${apiBase.replace(/\/$/, "")}/api/simulations/invite/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
    } finally {
      setSubmitting(false);
      setStep("done");
    }
  }

  return (
    <div className="hiring-shell min-h-screen">
      <div className="border-b border-paper-line/60 bg-paper/90 px-6 py-4 font-ui text-sm font-black text-ink">SocketHR Candidate Assessment</div>
      <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-2xl items-center px-4 py-10">
        {step === "welcome" && (
          <section className="w-full rounded-3xl border border-paper-line bg-paper-card p-8 shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight text-ink">Hi, {invite.candidateName}</h1>
            <p className="mt-3 font-ui text-sm leading-relaxed text-ink-muted">
              You have one 10-minute job simulation for <span className="font-semibold text-accent">{invite.jobTitle}</span>.
            </p>
            <div className="mt-6 grid gap-3 font-ui text-sm text-ink-muted">
              <p>10 minutes to complete.</p>
              <p>Scenarios can change mid-challenge, so adapt as new information arrives.</p>
              <p>Answer honestly. This is designed to show judgment, not memorization.</p>
            </div>
            <button type="button" onClick={() => setStep("questions")} className="mt-8 w-full rounded-2xl bg-accent px-5 py-3 font-ui text-sm font-black text-white hover:bg-accent-hover">
              Begin simulation
            </button>
          </section>
        )}
        {step === "questions" && q && (
          <section className="w-full rounded-3xl border border-paper-line bg-paper-card p-8 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="font-ui text-xs font-semibold uppercase tracking-widest text-ink-faint">Question {currentQ + 1} of {questions.length}</p>
                <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-paper-line">
                  <div className="h-full rounded-full bg-accent/60" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
                </div>
              </div>
              <p className="font-ui text-lg font-black tabular-nums text-accent">{mins}:{secs}</p>
            </div>
            {q.scenario && <p className="mb-4 rounded-2xl bg-paper-line/25 p-4 font-ui text-sm italic text-ink-muted">{q.scenario}</p>}
            {q.type === "case_unfolding" && (
              <div>
                <p className="mb-2 font-ui text-xs font-black uppercase tracking-widest text-accent">Phase 1</p>
                <p className="rounded-2xl bg-paper-line/25 p-4 font-ui text-sm text-ink-muted">{q.phase1_situation}</p>
                <p className="mt-4 font-semibold text-ink">{q.phase1_question}</p>
                <textarea rows={4} value={caseAns1} onChange={(e) => setCaseAns1(e.target.value)} disabled={casePhase === 2} className="mt-3 w-full rounded-2xl border border-paper-line bg-paper px-4 py-3 font-ui text-sm outline-none focus:border-accent/40 disabled:opacity-60" />
                {casePhase === 1 && (
                  <button type="button" disabled={!caseAns1.trim()} onClick={() => setCasePhase(2)} className="mt-4 w-full rounded-2xl border border-accent/25 px-4 py-3 font-ui text-sm font-bold text-accent disabled:opacity-40">
                    Reveal next development
                  </button>
                )}
                {casePhase === 2 && (
                  <div className="mt-5">
                    <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 font-ui text-sm text-amber-900">{q.phase2_reveal}</p>
                    <p className="mt-4 font-semibold text-ink">{q.phase2_question}</p>
                    <textarea rows={4} value={caseAns2} onChange={(e) => setCaseTwo(e.target.value)} className="mt-3 w-full rounded-2xl border border-paper-line bg-paper px-4 py-3 font-ui text-sm outline-none focus:border-accent/40" />
                  </div>
                )}
              </div>
            )}
            {q.type === "multiple_choice" && (
              <div>
                <p className="font-semibold text-ink">{q.question}</p>
                <div className="mt-4 grid gap-2">
                  {safeArr(q.options).map((option) => (
                    <label key={option} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 font-ui text-sm ${answers[currentQ] === option ? "border-accent bg-accent-soft text-accent" : "border-paper-line text-ink-muted"}`}>
                      <input type="radio" name={`q-${currentQ}`} checked={answers[currentQ] === option} onChange={() => setAnswers((prev) => ({ ...prev, [currentQ]: option }))} />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {(q.type === "short_answer" || q.type === "written") && (
              <div>
                <p className="font-semibold text-ink">{q.question}</p>
                <textarea rows={6} value={answers[currentQ] || ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [currentQ]: e.target.value }))} className="mt-4 w-full rounded-2xl border border-paper-line bg-paper px-4 py-3 font-ui text-sm outline-none focus:border-accent/40" />
              </div>
            )}
            {q.type === "prioritization" && (
              <div>
                <p className="font-semibold text-ink">{q.question}</p>
                <p className="mt-1 font-ui text-xs text-ink-faint">Click items in the order you would tackle them.</p>
                <div className="mt-4 grid gap-2">
                  {safeArr(q.items).map((item, index) => {
                    const rank = ranking.indexOf(index);
                    return (
                      <button key={item} type="button" onClick={() => toggleRank(index)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left font-ui text-sm ${rank >= 0 ? "border-accent bg-accent-soft text-accent" : "border-paper-line text-ink-muted"}`}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-line/50 text-xs font-black">{rank >= 0 ? rank + 1 : "-"}</span>
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button type="button" disabled={!canProceed || submitting} onClick={() => currentQ < questions.length - 1 ? setCurrentQ((x) => x + 1) : void submitAnswers()} className="mt-6 w-full rounded-2xl bg-accent px-5 py-3 font-ui text-sm font-black text-white hover:bg-accent-hover disabled:opacity-40">
              {submitting ? "Submitting..." : currentQ < questions.length - 1 ? "Next" : "Submit"}
            </button>
          </section>
        )}
        {step === "done" && (
          <section className="w-full rounded-3xl border border-paper-line bg-paper-card p-10 text-center shadow-sm">
            <h1 className="text-3xl font-bold text-ink">All done, {invite.candidateName}.</h1>
            <p className="mt-3 font-ui text-sm text-ink-muted">Your simulation has been submitted. The team will be in touch.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export function HiringApp() {
  const { apiBase, configLoaded: apiConfigLoaded } = useSockethrRuntimeConfig();
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const userName = session?.user?.name ?? session?.user?.email ?? null;
  const [hashToken, setHashToken] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const match = window.location.hash.match(/[?&]?token=([a-z0-9-]+)/i);
      setHashToken(match?.[1] || null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const getToken = useCallback(async () => {
    const tokenRes = await fetch("/api/mac-token", { cache: "no-store" });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    return tokenRes.ok && typeof (tokenJson as { token?: unknown }).token === "string"
      ? (tokenJson as { token: string }).token
      : "";
  }, []);

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const base = apiBase.replace(/\/$/, "");
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || `${path} failed (${res.status})`);
    return data;
  }, [apiBase, getToken]);

  const [page, setPage] = useState("home");
  const [job, setJob] = useState<JobSpec>({ title: "", description: "", requirements: "", culture: "" });
  const [resumeFiles, setResumeFiles] = useState<{ name: string; base64: string; type: string }[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [savedListings, setSavedListings] = useState<SavedListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [atsFilter, setAtsFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chat, setChat] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailState, setEmailState] = useState("idle");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [manualRankInput, setManualRankInput] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [interviewScoring, setInterviewScoring] = useState(false);
  const [showSimEditor, setShowSimEditor] = useState(false);
  const [showSimReport, setShowSimReport] = useState(false);
  const [simQuestions, setSimQuestions] = useState<SimulationQuestion[]>([]);
  const [simGenerating, setSimGenerating] = useState(false);
  const [repromptIndex, setRepromptIndex] = useState<number | null>(null);
  const [repromptText, setRepromptText] = useState("");
  const [jobTitleDuplicateHint, setJobTitleDuplicateHint] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  useEffect(() => {
    if (!loading) return;
    setLoadingTipIndex(0);
    const id = window.setInterval(() => setLoadingTipIndex((i) => (i + 1) % loadingTips.length), 3500);
    return () => window.clearInterval(id);
  }, [loading]);

  const refreshSavedListings = useCallback(async () => {
    if (!isLoggedIn) {
      setSavedListings([]);
      return;
    }
    setListingsLoading(true);
    try {
      const data = await apiFetch("/api/jobs");
      setSavedListings(Array.isArray((data as { jobs?: SavedListing[] }).jobs) ? (data as { jobs: SavedListing[] }).jobs : []);
    } catch {
      setSavedListings([]);
    }
    setListingsLoading(false);
  }, [apiFetch, isLoggedIn]);

  useEffect(() => { if (page === "home") void refreshSavedListings(); }, [page, refreshSavedListings]);

  function resetNewListingWizard() {
    setActiveJobId(null);
    setJob({ title: "", description: "", requirements: "", culture: "" });
    setResumeFiles([]);
    setCandidates([]);
    setSelected(null);
    setChat([]);
    setEmailState("idle");
    setInviteLink("");
    setJobTitleDuplicateHint("");
    setPage("onboard");
  }

  async function openSavedListing(jobId: string) {
    try {
      const data = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
      const bundle = data as { jobId: string; job: JobSpec; candidates: Candidate[] };
      setJob(bundle.job);
      setCandidates((bundle.candidates || []).map(normalizeCandidate));
      setActiveJobId(bundle.jobId);
      setSelected(null);
      setResumeFiles([]);
      setPage("ats");
    } catch (err) {
      alert("Could not open listing: " + (err as Error).message);
    }
  }

  async function readFileAsBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("Read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement> | { target: { files: FileList | File[]; value: string } }) {
    const files = Array.from(e.target.files ?? []).filter((file) =>
      file.type === "application/pdf" || [".txt", ".doc", ".docx"].some((ext) => file.name.toLowerCase().endsWith(ext))
    );
    const entries: { name: string; base64: string; type: string }[] = [];
    for (const file of files) entries.push({ name: file.name, base64: await readFileAsBase64(file), type: file.type });
    setResumeFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...entries.filter((entry) => !existing.has(entry.name))];
    });
    e.target.value = "";
  }

  async function analyzeResumes() {
    if (!resumeFiles.length) return;
    setLoading(true);
    try {
      const body = {
        job,
        resumes: resumeFiles.map((f) => ({ name: f.name, base64: f.base64, type: f.type })),
        ...(activeJobId ? { existingJobId: activeJobId } : {}),
      };
      const data = await apiFetch("/api/analyze", { method: "POST", body: JSON.stringify(body) }) as {
        jobId?: string;
        candidates?: Candidate[];
        storage?: { skippedCount?: number };
      };
      setCandidates((data.candidates || []).map(normalizeCandidate));
      if (data.jobId) setActiveJobId(data.jobId);
      setResumeFiles([]);
      setPage("ats");
      if (data.storage?.skippedCount) alert(`${data.storage.skippedCount} resume(s) were ranked but not stored because no applicant email was detected.`);
      void refreshSavedListings();
    } catch (err) {
      alert("Analysis failed: " + (err as Error).message);
    }
    setLoading(false);
  }

  function openProfile(candidate: Candidate) {
    const normalized = normalizeCandidate(candidate);
    setSelected(normalized);
    setManualRankInput(normalized.manualRank ? String(normalized.manualRank) : "");
    setInterviewNotes(normalized.interviewNotes || "");
    setInterviewDate(normalized.interviewDate || "");
    setInterviewTime(normalized.interviewTime || "");
    setChat([]);
    setEmailState("idle");
    setEmailDraft("");
    setInviteLink("");
    setShowSimEditor(false);
    setShowSimReport(false);
    setPage("profile");
  }

  function updateCandidateLocal(candidate: Candidate) {
    const normalized = normalizeCandidate(candidate);
    setCandidates((prev) => prev.map((c) => String(c.id) === String(normalized.id) ? normalized : c).sort((a, b) => safeScore(b.score) - safeScore(a.score)));
    setSelected(normalized);
    return normalized;
  }

  async function persistCandidate(candidate: Candidate) {
    const updated = updateCandidateLocal(candidate);
    if (!activeJobId) return updated;
    try {
      const data = await apiFetch("/api/candidates/update", {
        method: "POST",
        body: JSON.stringify({ jobId: activeJobId, candidateId: updated.id, candidate: updated }),
      }) as { candidates?: Candidate[]; candidate?: Candidate };
      if (data.candidates) setCandidates(data.candidates.map(normalizeCandidate));
      if (data.candidate) setSelected(normalizeCandidate(data.candidate));
    } catch (err) {
      console.error(err);
    }
    return updated;
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading || !selected) return;
    const message = chatInput.trim();
    setChatInput("");
    const next = [...chat, { role: "user", content: message }];
    setChat(next);
    setChatLoading(true);
    try {
      const data = await apiFetch("/api/chat", { method: "POST", body: JSON.stringify({ job, selected, messages: next }) }) as { reply?: string };
      setChat([...next, { role: "assistant", content: data.reply || "" }]);
    } catch {
      setChat([...next, { role: "assistant", content: "Sorry, I ran into an error. Please try again." }]);
    }
    setChatLoading(false);
  }

  async function generateFollowupEmail() {
    if (!selected) return;
    setEmailState("generating");
    try {
      const data = await apiFetch("/api/email", { method: "POST", body: JSON.stringify({ job, selected }) }) as { draft?: string };
      setEmailDraft(data.draft || "");
      setEmailState("editing");
    } catch {
      setEmailState("idle");
      alert("Failed to generate email.");
    }
  }

  async function loadSimulationQuestions(candidate: Candidate) {
    setShowSimEditor(true);
    setRepromptIndex(null);
    setRepromptText("");
    if (candidate.generatedQuestions?.length) {
      setSimQuestions(candidate.generatedQuestions);
      return;
    }
    setSimGenerating(true);
    try {
      const data = await apiFetch("/api/simulations/generate", { method: "POST", body: JSON.stringify({ job, candidate }) }) as { questions?: SimulationQuestion[] };
      setSimQuestions(data.questions || []);
    } catch (err) {
      alert("Question generation failed: " + (err as Error).message);
    }
    setSimGenerating(false);
  }

  async function repromptQuestion(index: number) {
    if (!repromptText.trim()) return;
    setSimGenerating(true);
    try {
      const data = await apiFetch("/api/simulations/reprompt", {
        method: "POST",
        body: JSON.stringify({ job, candidate: selected, question: simQuestions[index], instruction: repromptText }),
      }) as { question?: SimulationQuestion };
      if (data.question) setSimQuestions((prev) => prev.map((q, i) => i === index ? data.question! : q));
      setRepromptIndex(null);
      setRepromptText("");
    } catch (err) {
      alert("Reprompt failed: " + (err as Error).message);
    }
    setSimGenerating(false);
  }

  async function sendSimulationInvite(questions: SimulationQuestion[]) {
    if (!selected || !activeJobId) {
      alert("Analyze and save the job before sending simulations.");
      return;
    }
    try {
      const data = await apiFetch("/api/simulations/invite", {
        method: "POST",
        body: JSON.stringify({ jobId: activeJobId, candidateId: selected.id, questions }),
      }) as { token?: string; candidate?: Candidate };
      const baseUrl = window.location.href.split("#")[0];
      const link = `${baseUrl}#token=${data.token}`;
      setInviteLink(link);
      const updated = normalizeCandidate(data.candidate || { ...selected, testStatus: "invited", generatedQuestions: questions });
      updateCandidateLocal(updated);
      setShowSimEditor(false);
      setEmailDraft(`Hi ${updated.name},\n\nThanks for your interest in ${job.title}. Please complete this 10-minute SocketHR job simulation so we can understand how you would approach real work in the role.\n\n${link}\n\nBest,\nThe Hiring Team`);
      setEmailState("editing");
    } catch (err) {
      alert("Could not create invite: " + (err as Error).message);
    }
  }

  async function scoreInterviewNotes() {
    if (!selected || !interviewNotes.trim()) return;
    setInterviewScoring(true);
    try {
      const data = await apiFetch("/api/interview/score", {
        method: "POST",
        body: JSON.stringify({ jobId: activeJobId, candidateId: selected.id, job, candidate: selected, notes: interviewNotes, date: interviewDate, time: interviewTime }),
      }) as { candidate?: Candidate; candidates?: Candidate[] };
      if (data.candidates) setCandidates(data.candidates.map(normalizeCandidate));
      if (data.candidate) setSelected(normalizeCandidate(data.candidate));
    } catch (err) {
      alert("Scoring failed: " + (err as Error).message);
    }
    setInterviewScoring(false);
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const c = normalizeCandidate(candidate);
      const matchesSearch = !q || [c.name, c.email, c.recent_role, c.raw_summary, c.interviewNotes, ...(c.skills || [])].some((v) => String(v || "").toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (atsFilter === "all") return true;
      if (["hired", "rejected", "considering"].includes(atsFilter)) return c.hireStatus === atsFilter;
      return c.testStatus === atsFilter;
    });
  }, [atsFilter, candidates, searchQuery]);

  const stats = {
    total: candidates.length,
    tested: candidates.filter((c) => c.testStatus === "completed").length,
    hired: candidates.filter((c) => c.hireStatus === "hired").length,
    avgScore: candidates.length ? Math.round(candidates.reduce((sum, c) => sum + safeScore(c.score), 0) / candidates.length * 10) / 10 : 0,
  };

  if (hashToken) return <CandidatePortal token={hashToken} apiBase={apiBase || DEFAULT_API_BASE} />;

  const shell = "hiring-shell min-h-screen";
  const content = "fade-in-up mx-auto w-full max-w-3xl px-5 py-10 sm:px-8";
  const inputClass = "w-full rounded-2xl border border-paper-line bg-paper-card px-4 py-3 font-ui text-sm text-ink outline-none transition focus:border-accent/40";
  const primary = "rounded-2xl bg-accent px-5 py-3 font-ui text-sm font-black text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40";
  const secondary = "rounded-2xl bg-paper-line/30 px-5 py-3 font-ui text-sm font-semibold text-ink-muted transition hover:bg-paper-line/50 hover:text-ink";

  if (page === "home") return (
    <div className={shell}>
      <AppNav loggedIn={isLoggedIn} userName={userName} onHome={() => setPage("home")} onLogin={() => signIn("google")} onLogout={() => signOut()} searchQuery={searchQuery} setSearchQuery={setSearchQuery} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <section>
          <p className="font-ui text-xs font-black uppercase tracking-[0.35em] text-accent/70">SocketHR product</p>
          <h1 className="mt-5 text-5xl font-bold leading-[1.02] tracking-tight text-ink sm:text-7xl">
            Run the hiring pipeline like a performance lab.
          </h1>
          <p className="mt-6 max-w-xl font-ui text-lg leading-relaxed text-ink-muted">
            Create a role, upload resumes, rank candidates, send simulations, score interviews, and ask AI questions from one light, fast workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={resetNewListingWizard} className={primary}>Create job listing</button>
            {!isLoggedIn && <button type="button" onClick={() => signIn("google")} className={secondary}>Sign in with Google</button>}
          </div>
        </section>
        <section className="rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-ui text-sm font-black text-ink">Your workspace</h2>
            {listingsLoading && <Spinner label="Loading..." />}
          </div>
          {isLoggedIn && savedListings.length > 0 ? (
            <div className="mt-5 grid gap-2">
              {savedListings.map((listing) => (
                <button key={listing.jobId} type="button" onClick={() => void openSavedListing(listing.jobId)} className="rounded-2xl border border-paper-line bg-paper px-4 py-3 text-left transition hover:border-accent/25">
                  <p className="font-ui text-sm font-bold text-ink">{listing.title || "Untitled role"}</p>
                  <p className="mt-1 font-ui text-xs text-ink-faint">{listing.candidateCount} candidates</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-paper-line/25 p-5">
              <p className="font-ui text-sm text-ink-muted">
                {isLoggedIn ? "No saved jobs yet. Create one to start your pipeline." : "Guests can demo the product. Sign in to persist listings across sessions."}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );

  if (page === "onboard") return (
    <div className={shell}>
      <AppNav loggedIn={isLoggedIn} userName={userName} onHome={() => setPage("home")} onLogin={() => signIn("google")} onLogout={() => signOut()} searchQuery={searchQuery} setSearchQuery={setSearchQuery} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
      <main className={content}>
        <section className="rounded-[2rem] border border-paper-line bg-paper-card p-7 shadow-sm">
          <p className="font-ui text-xs font-black uppercase tracking-[0.3em] text-accent/70">Step 1</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">Create job listing</h1>
          <div className="mt-7 grid gap-4">
            <input className={inputClass} placeholder="Job title" value={job.title} onChange={(e) => { setJobTitleDuplicateHint(""); setJob({ ...job, title: e.target.value }); }} />
            {jobTitleDuplicateHint && <p className="font-ui text-sm text-amber-800">{jobTitleDuplicateHint}</p>}
            <textarea rows={4} className={inputClass} placeholder="Job description" value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} />
            <textarea rows={3} className={inputClass} placeholder="Requirements" value={job.requirements} onChange={(e) => setJob({ ...job, requirements: e.target.value })} />
            <textarea rows={2} className={inputClass} placeholder="Culture and fit" value={job.culture} onChange={(e) => setJob({ ...job, culture: e.target.value })} />
            <button type="button" disabled={!job.title || !job.description || !job.requirements} onClick={() => {
              const norm = normalizeJobTitle(job.title);
              if (isLoggedIn && !activeJobId && savedListings.some((l) => normalizeJobTitle(l.title) === norm)) {
                setJobTitleDuplicateHint("You already have a listing for this title. Open it from the home screen to add resumes.");
                return;
              }
              setPage("upload");
            }} className={primary}>Next: upload resumes</button>
          </div>
        </section>
      </main>
    </div>
  );

  if (page === "upload") {
    function onDrop(e: DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragging(false);
      void handleFileSelect({ target: { files: Array.from(e.dataTransfer.files), value: "" } });
    }
    return (
      <div className={shell}>
        <AppNav loggedIn={isLoggedIn} userName={userName} onHome={() => setPage("home")} onLogin={() => signIn("google")} onLogout={() => signOut()} searchQuery={searchQuery} setSearchQuery={setSearchQuery} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        <main className={content}>
          <section className="rounded-[2rem] border border-paper-line bg-paper-card p-7 shadow-sm">
            <p className="font-ui text-xs font-black uppercase tracking-[0.3em] text-accent/70">Step 2</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">Upload resumes</h1>
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => fileInputRef.current?.click()} className={`mt-7 flex cursor-pointer flex-col items-center rounded-[2rem] border-2 border-dashed px-6 py-14 text-center transition ${dragging ? "border-accent bg-accent-soft" : "border-paper-line bg-paper hover:border-accent/30"}`}>
              <p className="font-ui text-sm font-bold text-ink">Drag and drop resumes here</p>
              <p className="mt-1 font-ui text-xs text-ink-faint">PDF, TXT, DOC, or DOCX. Bulk upload supported.</p>
              <span className="mt-4 rounded-xl bg-accent-soft px-4 py-2 font-ui text-xs font-black text-accent">Browse files</span>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx" multiple className="hidden" onChange={handleFileSelect} />
            </div>
            {resumeFiles.length > 0 && (
              <div className="mt-5 grid max-h-52 gap-2 overflow-y-auto">
                {resumeFiles.map((file) => (
                  <div key={file.name} className="flex items-center justify-between rounded-2xl bg-paper px-4 py-2 font-ui text-sm">
                    <span className="truncate text-ink-muted">{file.name}</span>
                    <button type="button" onClick={() => setResumeFiles((prev) => prev.filter((f) => f.name !== file.name))} className="text-xs text-ink-faint hover:text-ink">Remove</button>
                  </div>
                ))}
              </div>
            )}
            {loading && <div className="mt-5 rounded-2xl bg-paper p-4"><Spinner label={loadingTips[loadingTipIndex]} /></div>}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setPage(activeJobId ? "ats" : "onboard")} className={`flex-1 ${secondary}`}>Back</button>
              <button type="button" disabled={!resumeFiles.length || loading} onClick={analyzeResumes} className={`flex-1 ${primary}`}>{loading ? "Analyzing..." : `Analyze ${resumeFiles.length} resume(s)`}</button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (page === "ats") return (
    <div className={shell}>
      <AppNav loggedIn={isLoggedIn} userName={userName} onHome={() => setPage("home")} onLogin={() => signIn("google")} onLogout={() => signOut()} onNewJob={resetNewListingWizard} searchQuery={searchQuery} setSearchQuery={setSearchQuery} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
      <div className="flex min-h-[calc(100vh-57px)]">
        {sidebarOpen && (
          <aside className="hidden w-60 shrink-0 border-r border-paper-line/60 bg-paper-card/55 p-4 sm:block">
            <p className="font-ui text-xs font-black uppercase tracking-widest text-ink-faint">Filter</p>
            <div className="mt-3 grid gap-1">
              {["all", "pending", "invited", "completed", "considering", "hired", "rejected"].map((filter) => (
                <button key={filter} type="button" onClick={() => setAtsFilter(filter)} className={`rounded-xl px-3 py-2 text-left font-ui text-xs capitalize ${atsFilter === filter ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-paper-line/25"}`}>{filter === "pending" ? "not tested" : filter}</button>
              ))}
            </div>
          </aside>
        )}
        <main className="min-w-0 flex-1">
          <div className="border-b border-paper-line/60 px-5 py-4 sm:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setSidebarOpen((v) => !v)} className="rounded-lg px-2 py-1 text-ink-faint hover:bg-paper-line/25">Menu</button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{searchQuery ? `Search: ${searchQuery}` : job.title || "Pipeline"}</h1>
                <p className="font-ui text-xs text-ink-faint">{filtered.length} candidate(s)</p>
              </div>
              <div className="hidden gap-2 md:flex">
                {[["Candidates", stats.total], ["Avg", stats.avgScore], ["Tested", stats.tested], ["Hired", stats.hired]].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-paper-card px-4 py-2 text-center shadow-sm">
                    <p className="font-ui text-sm font-black text-ink">{value}</p>
                    <p className="font-ui text-[11px] text-ink-faint">{label}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setPage("upload")} className={primary}>+ Upload resumes</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left font-ui text-sm">
              <thead className="border-b border-paper-line bg-paper-card/70 text-xs uppercase tracking-wider text-ink-faint">
                <tr>{["Candidate", "Current Role", "Resume", "Simulation", "Combined", "Status", "Pipeline", "Actions"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((candidate) => {
                  const c = normalizeCandidate(candidate);
                  return (
                    <tr key={String(c.id)} onClick={() => openProfile(c)} className="cursor-pointer border-b border-paper-line/50 transition hover:bg-paper-card/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-black text-accent">{c.name?.[0]?.toUpperCase() || "?"}</span>
                          <div><p className="font-bold text-ink">{c.name}</p><p className="text-xs text-ink-faint">{c.email}</p></div>
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-ink-muted">{c.recent_role}</td>
                      <td className="px-4 py-3"><ScorePill score={c.resumeScore} /></td>
                      <td className="px-4 py-3"><ScorePill score={c.simulationScore} /></td>
                      <td className="px-4 py-3"><ScorePill score={c.score} /></td>
                      <td className="px-4 py-3"><StatusPill status={c.testStatus} /></td>
                      <td className="px-4 py-3"><HireBadge status={c.hireStatus} /></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => void persistCandidate({ ...c, hireStatus: c.hireStatus === "hired" ? "none" : "hired" })} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">Hire</button>
                          <button type="button" onClick={() => void persistCandidate({ ...c, hireStatus: c.hireStatus === "rejected" ? "none" : "rejected" })} className="rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-800">Reject</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );

  if (page === "profile" && selected) {
    const c = normalizeCandidate(candidates.find((row) => String(row.id) === String(selected.id)) || selected);
    const hasTest = c.testStatus === "completed";
    return (
      <div className={shell}>
        <AppNav loggedIn={isLoggedIn} userName={userName} onHome={() => setPage("home")} onLogin={() => signIn("google")} onLogout={() => signOut()} searchQuery={searchQuery} setSearchQuery={setSearchQuery} apiBase={apiBase} apiConfigLoaded={apiConfigLoaded} />
        {showSimEditor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[2rem] border border-paper-line bg-paper-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-paper-line px-6 py-4">
                <div><h2 className="text-xl font-bold text-ink">Review & edit simulation</h2><p className="font-ui text-xs text-ink-faint">Questions for {c.name}</p></div>
                <button type="button" onClick={() => setShowSimEditor(false)} className="text-2xl text-ink-faint">x</button>
              </div>
              <div className="max-h-[65vh] overflow-y-auto p-6">
                {simGenerating && <Spinner label="Generating simulation..." />}
                <div className="grid gap-4">
                  {simQuestions.map((question, index) => (
                    <div key={index} className="rounded-2xl border border-paper-line bg-paper p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <p className="font-ui text-xs font-black uppercase tracking-wider text-accent">Q{index + 1} {question.type.replace("_", " ")}</p>
                        <div className="flex gap-3">
                          <button type="button" onClick={() => setRepromptIndex(repromptIndex === index ? null : index)} className="font-ui text-xs font-bold text-accent">Reprompt</button>
                          <button type="button" onClick={() => setSimQuestions((prev) => prev.filter((_, i) => i !== index))} className="font-ui text-xs text-red-700">Remove</button>
                        </div>
                      </div>
                      {question.scenario && <p className="mb-2 font-ui text-xs italic text-ink-faint">Scenario: {question.scenario}</p>}
                      {question.type === "case_unfolding" ? (
                        <div className="grid gap-2 font-ui text-sm text-ink-muted">
                          <p><strong className="text-ink">Phase 1:</strong> {question.phase1_situation} {question.phase1_question}</p>
                          <p><strong className="text-ink">Twist:</strong> {question.phase2_reveal} {question.phase2_question}</p>
                        </div>
                      ) : question.type === "prioritization" ? (
                        <ul className="list-disc pl-5 font-ui text-sm text-ink-muted">{safeArr(question.items).map((item) => <li key={item}>{item}</li>)}</ul>
                      ) : (
                        <p className="font-ui text-sm text-ink-muted">{question.question}</p>
                      )}
                      {repromptIndex === index && (
                        <div className="mt-3 flex gap-2">
                          <input className={inputClass} placeholder="Make it more role-specific..." value={repromptText} onChange={(e) => setRepromptText(e.target.value)} />
                          <button type="button" onClick={() => void repromptQuestion(index)} className={primary}>Go</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 border-t border-paper-line px-6 py-4">
                <button type="button" onClick={() => void loadSimulationQuestions(c)} className={secondary}>Regenerate all</button>
                <button type="button" disabled={!simQuestions.length || simGenerating} onClick={() => void sendSimulationInvite(simQuestions)} className={`flex-1 ${primary}`}>Send to candidate</button>
              </div>
            </div>
          </div>
        )}
        {showSimReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-2xl font-bold text-ink">Simulation report</h2><p className="font-ui text-sm text-ink-faint">{c.name}</p></div>
                <button type="button" onClick={() => setShowSimReport(false)} className="text-2xl text-ink-faint">x</button>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-paper p-4 text-center"><p className="text-xs text-ink-faint">Resume</p><p className="text-2xl font-black text-ink">{c.resumeScore}/10</p></div>
                <div className="rounded-2xl bg-accent-soft p-4 text-center"><p className="text-xs text-accent">Simulation</p><p className="text-2xl font-black text-accent">{c.simulationScore}/10</p></div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-center"><p className="text-xs text-emerald-800">Combined</p><p className="text-2xl font-black text-emerald-800">{c.score}/10</p></div>
              </div>
              {c.assessmentSummary && <p className="mt-5 rounded-2xl bg-paper p-4 font-ui text-sm italic text-ink-muted">{c.assessmentSummary}</p>}
              <div className="mt-5 grid gap-3">
                {(c.questionBreakdown || []).map((row, index) => (
                  <div key={index} className="rounded-2xl border border-paper-line bg-paper p-4">
                    <div className="flex items-center justify-between"><p className="font-ui text-sm font-bold text-ink">Question {row.questionId || index + 1}</p><ScorePill score={row.score} /></div>
                    <p className="mt-2 font-ui text-sm text-ink-muted">{row.feedback}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
          <button type="button" onClick={() => setPage("ats")} className="mb-5 font-ui text-xs font-bold text-accent">Back to pipeline</button>
          <section className="rounded-[2rem] border border-paper-line bg-paper-card p-7 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft text-2xl font-black text-accent">{c.name?.[0]?.toUpperCase() || "?"}</span>
                <div><h1 className="text-3xl font-bold tracking-tight text-ink">{c.name}</h1><p className="font-ui text-sm text-ink-muted">{c.recent_role}</p><p className="mt-1 font-ui text-xs text-ink-faint">{c.email} {c.phone ? `· ${c.phone}` : ""}</p></div>
              </div>
              <div className="flex flex-wrap gap-2"><ScorePill score={c.score} /><StatusPill status={c.testStatus} /><HireBadge status={c.hireStatus} />{c.integrityFlag && <span className="rounded-full bg-red-50 px-2.5 py-1 font-ui text-xs font-bold text-red-800">Integrity flag</span>}</div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-paper p-4 text-center"><p className="font-ui text-xs text-ink-faint">Resume</p><p className="text-2xl font-black text-ink">{c.resumeScore}/10</p></div>
              <div className="rounded-2xl bg-paper p-4 text-center"><p className="font-ui text-xs text-ink-faint">Simulation</p><p className="text-2xl font-black text-ink">{c.simulationScore ?? "-"}</p></div>
              <div className="rounded-2xl bg-paper p-4 text-center"><p className="font-ui text-xs text-ink-faint">Combined</p><p className="text-2xl font-black text-accent">{c.score}/10</p></div>
            </div>
            <p className="mt-5 font-ui text-sm italic leading-relaxed text-ink-muted">{c.fit_summary}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{safeArr(c.skills).map((skill) => <span key={skill} className="rounded-full bg-paper-line/35 px-2.5 py-1 font-ui text-xs text-ink-muted">{skill}</span>)}</div>
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
              <h2 className="font-ui text-sm font-black text-ink">Strengths</h2>
              <ul className="mt-3 grid gap-2 font-ui text-sm text-ink-muted">{[...safeArr(c.strengths), ...safeArr(c.assessmentStrengths)].map((item, i) => <li key={i}>- {item}</li>)}</ul>
            </section>
            <section className="rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
              <h2 className="font-ui text-sm font-black text-ink">Gaps</h2>
              <ul className="mt-3 grid gap-2 font-ui text-sm text-ink-muted">{[...safeArr(c.weaknesses), ...safeArr(c.assessmentGaps)].map((item, i) => <li key={i}>- {item}</li>)}</ul>
            </section>
          </div>

          <section className="mt-5 rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
            {c.testStatus === "completed" ? (
              <div className="flex items-center justify-between gap-4"><div><h2 className="font-ui text-sm font-black text-emerald-800">Simulation complete</h2><p className="mt-1 font-ui text-sm text-ink-muted">Full performance report is available.</p></div><button type="button" onClick={() => setShowSimReport(true)} className={primary}>View report</button></div>
            ) : c.testStatus === "invited" ? (
              <div><h2 className="font-ui text-sm font-black text-amber-800">Simulation sent</h2><button type="button" onClick={() => void loadSimulationQuestions(c)} className="mt-2 font-ui text-xs font-bold text-accent">Edit simulation</button></div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-ui text-sm font-black text-ink">10-minute case simulation</h2><p className="mt-1 font-ui text-sm text-ink-muted">Adaptive scenarios plus prioritization challenges.</p></div><button type="button" onClick={() => void loadSimulationQuestions(c)} className={primary}>Review & send simulation</button></div>
            )}
          </section>

          <section className="mt-5 rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
            <h2 className="font-ui text-sm font-black text-ink">Manual rank override</h2>
            <div className="mt-4 grid grid-cols-10 gap-1.5">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} type="button" onClick={() => setManualRankInput(String(n))} className={`rounded-xl py-2 font-ui text-xs font-black ${manualRankInput === String(n) ? "bg-accent text-white" : "bg-paper text-ink-muted"}`}>{n}</button>)}</div>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={!manualRankInput} onClick={() => void persistCandidate({ ...c, score: Number(manualRankInput), manualRank: Number(manualRankInput) })} className={primary}>Apply</button>
              {c.manualRank && <button type="button" onClick={() => { setManualRankInput(""); void persistCandidate({ ...c, score: c.resumeScore, manualRank: null }); }} className={secondary}>Clear</button>}
            </div>
          </section>

          <section className="mt-5 rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
            <h2 className="font-ui text-sm font-black text-ink">Interview</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><input type="date" className={inputClass} value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} /><input type="time" className={inputClass} value={interviewTime} onChange={(e) => setInterviewTime(e.target.value)} /></div>
            <textarea rows={5} className={`mt-3 ${inputClass}`} placeholder={`Notes for ${c.name}...`} value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} />
            {c.interviewSummary && <p className="mt-3 rounded-2xl bg-emerald-50 p-3 font-ui text-sm text-emerald-800">{c.interviewSummary}</p>}
            <button type="button" disabled={!interviewNotes.trim() || interviewScoring} onClick={() => void scoreInterviewNotes()} className={`mt-3 ${primary}`}>{interviewScoring ? "Scoring..." : "Save & score notes"}</button>
          </section>

          <section className="mt-5 rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
            <h2 className="font-ui text-sm font-black text-ink">Send email</h2>
            {emailState === "idle" && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void loadSimulationQuestions(c)} className={secondary}>Simulation invite</button><button type="button" onClick={() => void generateFollowupEmail()} className={primary}>Interview follow-up</button></div>}
            {emailState === "generating" && <div className="mt-3"><Spinner label="Drafting..." /></div>}
            {emailState === "editing" && (
              <div className="mt-3">
                <textarea rows={9} className={`${inputClass} font-mono text-[13px]`} value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
                {inviteLink && <div className="mt-3 rounded-2xl bg-paper p-3"><p className="break-all font-mono text-xs text-ink-muted">{inviteLink}</p><button type="button" onClick={() => { void navigator.clipboard.writeText(inviteLink); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} className="mt-2 font-ui text-xs font-bold text-accent">{copied ? "Copied" : "Copy link"}</button></div>}
                <div className="mt-3 flex gap-2"><button type="button" onClick={() => { window.location.href = buildMailto({ to: c.email, subject: job.title ? `Interview opportunity: ${job.title}` : "Interview opportunity", body: emailDraft }); }} className={primary}>Open in email app</button><button type="button" onClick={() => { setEmailState("idle"); setInviteLink(""); }} className={secondary}>Discard</button></div>
              </div>
            )}
          </section>

          <section className="mt-5 rounded-[2rem] border border-paper-line bg-paper-card p-6 shadow-sm">
            <h2 className="font-ui text-sm font-black text-ink">Hiring intelligence chat</h2>
            <div className="mt-3 flex max-h-72 min-h-16 flex-col gap-2 overflow-y-auto">
              {chat.length === 0 && <p className="font-ui text-sm italic text-ink-faint">Ask anything about this candidate...</p>}
              {chat.map((message, index) => <div key={index} className={`max-w-[86%] rounded-2xl px-3 py-2 font-ui text-sm ${message.role === "user" ? "self-end bg-accent-soft text-accent" : "self-start bg-paper text-ink-muted"}`}>{message.role === "assistant" ? <AssistantMarkdown content={message.content} /> : message.content}</div>)}
              {chatLoading && <div className="self-start"><Spinner label="Thinking..." /></div>}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-3 flex gap-2"><input className={inputClass} placeholder="Ask about this candidate..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void sendChat(); }} /><button type="button" disabled={!chatInput.trim() || chatLoading} onClick={() => void sendChat()} className={primary}>Send</button></div>
          </section>
        </main>
      </div>
    );
  }

  return null;
}
