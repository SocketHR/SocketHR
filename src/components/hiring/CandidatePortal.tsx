"use client";

import { useEffect, useRef, useState } from "react";
import { safeArr, safeStr, TYPE_META } from "./mockUtils";

function evaluateSimulation(questions: any[], answers: Record<number, string>) {
  const answered = questions.filter((_, i) => safeStr(answers[i]).trim().length > 0).length;
  const ratio = questions.length > 0 ? answered / questions.length : 0;
  const simulationScore = Math.max(1, Math.min(10, Math.round(ratio * 10)));
  return {
    simulationScore,
    combinedScore: simulationScore,
    newStrengths: ["Clear communication", "Thoughtful prioritization"].slice(0, simulationScore >= 6 ? 2 : 1),
    newGaps: simulationScore >= 6 ? ["Could provide deeper trade-off reasoning"] : ["Needs clearer structure in responses"],
    assessmentSummary: simulationScore >= 6 ? "Candidate showed solid practical judgment in the simulation." : "Candidate completed the simulation with room to improve decision quality.",
    coachingNote: "Use explicit trade-offs and assumptions in each response.",
    integrityFlag: false,
    detailedReport: {
      communicationScore: simulationScore,
      communicationNotes: "Clear but can be more concise.",
      salesAcumenScore: simulationScore,
      salesAcumenNotes: "Reasonable commercial instincts.",
      situationalJudgmentScore: simulationScore,
      situationalJudgmentNotes: "Handled evolving scenarios adequately.",
      customerEmpathyScore: simulationScore,
      customerEmpathyNotes: "Generally customer-aware responses.",
      ethicsScore: simulationScore,
      ethicsNotes: "No integrity concerns observed.",
      roleFitScore: simulationScore,
      roleFitNotes: "Overall role fit appears moderate to strong.",
    },
    questionBreakdown: questions.map((_: any, i: number) => ({
      questionId: i + 1,
      score: simulationScore,
      feedback: safeStr(answers[i]) ? "Answered with relevant context." : "Missing response.",
    })),
  };
}

export default function CandidatePortal({ token }: { token: string }) {
  const info = (window as any)._socketTokens?.[token];
  const [step, setStep] = useState(info?.answered ? "done" : "welcome");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const timerRef = useRef<number | null>(null);
  const submitted = useRef(false);
  const questions = info?.questions || [];

  useEffect(() => {
    if (step !== "questions") return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          handleSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="max-w-sm rounded-2xl border border-paper-line bg-paper p-10 text-center">
          <h2 className="mb-2 text-xl font-bold text-ink">Link not found</h2>
          <p className="text-sm text-ink-faint">This link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  async function handleSubmit() {
    if (submitted.current) return;
    submitted.current = true;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setSubmitting(true);
    const result = evaluateSimulation(questions, answers);
    (window as any)._socketResults[token] = result;
    (window as any)._socketTokens[token].answered = true;
    setSubmitting(false);
    setStep("done");
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, "0");
  const q = questions[currentQ];
  const canProceed = q ? !!safeStr(answers[currentQ]).trim() : false;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="border-b border-paper-line px-6 py-4">
        <span className="text-sm font-bold text-ink">SocketHR</span>
        <span className="ml-2 text-xs text-ink-faint">Candidate Assessment</span>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        {step === "welcome" && (
          <div className="w-full max-w-md rounded-2xl border border-paper-line bg-paper p-8">
            <h1 className="mb-1 text-2xl font-bold text-ink">Hi, {info.candidateName}</h1>
            <p className="mb-4 text-sm text-ink-faint">
              You have one task for your application to <span className="font-semibold text-ink">{info.jobTitle}</span>.
            </p>
            <button
              type="button"
              onClick={() => setStep("questions")}
              className="w-full rounded-xl bg-accent/10 py-3.5 text-sm font-bold text-accent"
            >
              Begin Simulation
            </button>
          </div>
        )}
        {step === "questions" && q && (
          <div className="w-full max-w-xl rounded-2xl border border-paper-line bg-paper p-8">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs text-ink-faint">
                Question {currentQ + 1} of {questions.length}
              </p>
              <div className="text-lg font-bold tabular-nums text-ink">
                {mins}:{secs}
              </div>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${(TYPE_META[q.type] || TYPE_META.short_answer).cls}`}>
                {(TYPE_META[q.type] || TYPE_META.short_answer).label}
              </span>
            </div>
            <p className="mb-4 text-base font-bold text-ink">{safeStr(q.phase1_question || q.question)}</p>
            <textarea
              rows={5}
              className="w-full resize-none rounded-xl border border-paper-line bg-paper-line/20 px-4 py-3 text-sm text-ink focus:outline-none"
              placeholder="Write your response..."
              value={answers[currentQ] || ""}
              onChange={(e) => setAnswers((p) => ({ ...p, [currentQ]: e.target.value }))}
            />
            <button
              type="button"
              disabled={!canProceed || submitting}
              onClick={() => {
                if (currentQ < questions.length - 1) setCurrentQ((v) => v + 1);
                else handleSubmit();
              }}
              className="mt-5 w-full rounded-xl bg-accent/10 py-3 text-sm font-bold text-accent disabled:opacity-50"
            >
              {submitting ? "Submitting..." : currentQ < questions.length - 1 ? "Next" : "Submit"}
            </button>
          </div>
        )}
        {step === "done" && (
          <div className="w-full max-w-md rounded-2xl border border-paper-line bg-paper p-10 text-center">
            <h2 className="mb-2 text-2xl font-bold text-ink">All done, {info.candidateName}!</h2>
            <p className="text-sm text-ink-faint">Your simulation has been submitted.</p>
          </div>
        )}
      </div>
    </div>
  );
}
