"use client";

import { useEffect, useState } from "react";
import { safeArr, safeStr, TYPE_META } from "./mockUtils";

export default function SimulationEditor({ candidate, onClose, onSendWithQuestions }: any) {
  const [questions, setQuestions] = useState(Array.isArray(candidate?.generatedQuestions) ? candidate.generatedQuestions : []);
  const [generating, setGenerating] = useState(questions.length === 0);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    if (generating) generateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateAll() {
    setGenerating(true);
    setGenError("");
    try {
      const fallback = [
        {
          type: "case_unfolding",
          scenario: "Customer escalation",
          phase1_situation: "A customer threatens to churn over delayed onboarding.",
          phase1_question: "What is your immediate move?",
          phase2_reveal: "Their legal team is now requesting a formal response.",
          phase2_question: "How do you adapt your plan?",
        },
        {
          type: "prioritization",
          scenario: "High-volume inbox",
          question: "Rank these tasks in priority order.",
          items: ["Reply to churn-risk customer", "Unblock implementation", "Update CRM", "Prep QBR deck", "Review pipeline"],
        },
        {
          type: "multiple_choice",
          scenario: "Discount pressure",
          question: "A prospect asks for a non-approved discount. What do you do?",
          options: ["A) Approve immediately", "B) Decline and end call", "C) Escalate with rationale", "D) Ignore and follow up later"],
        },
        {
          type: "short_answer",
          scenario: "Stakeholder update",
          question: "Draft a concise update email to leadership after a difficult client call.",
        },
        {
          type: "case_unfolding",
          scenario: "Launch week incident",
          phase1_situation: "A key dependency is unavailable one day before launch.",
          phase1_question: "What do you do first?",
          phase2_reveal: "A second blocker appears in QA.",
          phase2_question: "How do you adjust priorities and communication?",
        },
      ];
      setQuestions(fallback);
    } catch (e: any) {
      setGenError(`Generation failed: ${e?.message || "unknown error"}`);
    }
    setGenerating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-paper-line bg-paper">
        <div className="flex shrink-0 items-center justify-between border-b border-paper-line px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-ink">Review & Edit Simulation</h3>
            <p className="text-xs text-ink-faint">Questions for {candidate?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink-faint">
            x
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {generating && <div className="py-10 text-center text-sm text-ink-faint">Generating simulation...</div>}
          {genError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{genError}</div>}
          {!generating &&
            questions.map((q: any, idx: number) => {
              const meta = TYPE_META[q.type] || TYPE_META.short_answer;
              return (
                <div key={idx} className="rounded-xl border border-paper-line bg-paper-line/10 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink-faint">Q{idx + 1}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <button type="button" onClick={() => setQuestions((prev: any[]) => prev.filter((_, i) => i !== idx))} className="text-xs text-red-600">
                      Remove
                    </button>
                  </div>
                  {safeStr(q.scenario) && <p className="mb-2 text-xs italic text-ink-faint">Scenario: {q.scenario}</p>}
                  {q.type === "case_unfolding" && (
                    <div className="space-y-2">
                      <p className="text-xs text-ink">{safeStr(q.phase1_question)}</p>
                      <p className="text-xs text-ink-faint">{safeStr(q.phase2_question)}</p>
                    </div>
                  )}
                  {q.type === "prioritization" && (
                    <div className="space-y-1">
                      {safeArr(q.items).map((item, i) => (
                        <p key={i} className="text-xs text-ink-faint">{i + 1}. {item}</p>
                      ))}
                    </div>
                  )}
                  {q.type === "multiple_choice" && (
                    <div>
                      <p className="mb-2 text-sm text-ink">{safeStr(q.question)}</p>
                      <div className="space-y-1">
                        {safeArr(q.options).map((opt, oi) => (
                          <p key={oi} className="text-xs text-ink-faint">{opt}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {(q.type === "short_answer" || q.type === "written") && <p className="text-sm text-ink">{safeStr(q.question)}</p>}
                </div>
              );
            })}
        </div>
        <div className="flex shrink-0 gap-2 border-t border-paper-line px-6 py-4">
          <button type="button" onClick={generateAll} disabled={generating} className="rounded-xl border border-paper-line px-4 py-2.5 text-xs text-ink">
            Regenerate
          </button>
          <button
            type="button"
            disabled={questions.length === 0 || generating}
            onClick={() => onSendWithQuestions(questions)}
            className="flex-1 rounded-xl bg-accent/10 py-2.5 text-sm font-bold text-accent"
          >
            Send to Candidate
          </button>
        </div>
      </div>
    </div>
  );
}
