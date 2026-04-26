"use client";

export function safeArr(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => (x == null ? "" : String(x)));
  if (v == null || v === "") return [];
  if (typeof v === "string") return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function safeNum(v: any, fb = 5): number {
  const n = Number(v);
  return !Number.isNaN(n) && Number.isFinite(n) ? Math.round(Math.min(10, Math.max(0, n))) : fb;
}

export function safeStr(v: any): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

export function safeCandidate(c: any) {
  return {
    ...c,
    name: safeStr(c?.name) || "Unknown",
    email: safeStr(c?.email),
    phone: safeStr(c?.phone),
    recent_role: safeStr(c?.recent_role),
    raw_summary: safeStr(c?.raw_summary),
    education: safeStr(c?.education),
    fit_summary: safeStr(c?.fit_summary),
    score_rationale: safeStr(c?.score_rationale),
    assessmentSummary: safeStr(c?.assessmentSummary),
    coachingNote: safeStr(c?.coachingNote),
    interviewNotes: safeStr(c?.interviewNotes),
    interviewDate: safeStr(c?.interviewDate),
    interviewTime: safeStr(c?.interviewTime),
    interviewSummary: safeStr(c?.interviewSummary),
    skills: safeArr(c?.skills),
    strengths: safeArr(c?.strengths),
    weaknesses: safeArr(c?.weaknesses),
    assessmentStrengths: safeArr(c?.assessmentStrengths),
    assessmentGaps: safeArr(c?.assessmentGaps),
    simulationReport: c?.simulationReport || null,
    simulationQuestions: safeArr(c?.simulationQuestions),
    generatedQuestions: Array.isArray(c?.generatedQuestions) ? c.generatedQuestions : [],
    questionBreakdown: Array.isArray(c?.questionBreakdown) ? c.questionBreakdown : [],
    score: safeNum(c?.score),
    resumeScore: safeNum(c?.resumeScore),
    simulationScore: c?.simulationScore != null ? safeNum(c.simulationScore) : null,
    years_experience: safeNum(c?.years_experience, 0),
    manualRank: c?.manualRank != null ? safeNum(c.manualRank) : null,
    testStatus: ["pending", "invited", "completed"].includes(c?.testStatus) ? c.testStatus : "pending",
    hireStatus: ["none", "considering", "hired", "rejected"].includes(c?.hireStatus) ? c.hireStatus : "none",
    integrityFlag: !!c?.integrityFlag,
    inviteToken: c?.inviteToken || null,
  };
}

export const TYPE_META: Record<string, { label: string; cls: string }> = {
  multiple_choice: { label: "Multiple Choice", cls: "bg-accent/10 text-accent" },
  short_answer: { label: "Written", cls: "bg-paper-line/40 text-ink" },
  written: { label: "Written", cls: "bg-paper-line/40 text-ink" },
  case_unfolding: { label: "Case Unfolding", cls: "bg-indigo-500/10 text-indigo-700" },
  prioritization: { label: "Prioritization", cls: "bg-emerald-500/10 text-emerald-700" },
};

export function scorePillClass(score: number): string {
  if (score >= 8) return "bg-emerald-50 text-emerald-800";
  if (score >= 6) return "bg-sky-50 text-sky-800";
  if (score >= 4) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-800";
}
