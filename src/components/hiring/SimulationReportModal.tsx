"use client";

import { safeArr, safeNum, safeStr, scorePillClass } from "./mockUtils";

function ScorePill({ score }: { score: any }) {
  const s = safeNum(score, 0);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${scorePillClass(s)}`}>{s}/10</span>;
}

export default function SimulationReportModal({ candidate, onClose }: any) {
  const r = candidate?.simulationReport;
  if (!r) return null;
  const dims = [
    ["Communication", r.communicationScore, r.communicationNotes],
    ["Sales Acumen", r.salesAcumenScore, r.salesAcumenNotes],
    ["Situational Judgment", r.situationalJudgmentScore, r.situationalJudgmentNotes],
    ["Customer Empathy", r.customerEmpathyScore, r.customerEmpathyNotes],
    ["Ethics & Integrity", r.ethicsScore, r.ethicsNotes],
    ["Role Fit", r.roleFitScore, r.roleFitNotes],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-paper-line bg-paper">
        <div className="sticky top-0 flex items-center justify-between border-b border-paper-line bg-paper px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-ink">Simulation Report</h3>
            <p className="text-xs text-ink-faint">{candidate.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink-faint">
            x
          </button>
        </div>
        <div className="p-6">
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-paper-line/20 p-3 text-center">
              <p className="mb-1 text-xs text-ink-faint">Resume</p>
              <p className="text-2xl font-black text-ink">{candidate.resumeScore}/10</p>
            </div>
            <div className="rounded-xl bg-paper-line/20 p-3 text-center">
              <p className="mb-1 text-xs text-ink-faint">Simulation</p>
              <p className="text-2xl font-black text-ink">{candidate.simulationScore}/10</p>
            </div>
            <div className="rounded-xl bg-paper-line/20 p-3 text-center">
              <p className="mb-1 text-xs text-ink-faint">Combined</p>
              <p className="text-2xl font-black text-ink">{candidate.score}/10</p>
            </div>
          </div>
          {candidate.assessmentSummary && (
            <div className="mb-5 rounded-xl bg-paper-line/20 p-4 text-sm italic text-ink-muted">
              "{candidate.assessmentSummary}"
            </div>
          )}
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-faint">Performance by Dimension</h4>
          <div className="mb-6 space-y-3">
            {dims.map(([label, score, notes]) => {
              const s = safeNum(score, 5);
              const pct = (s / 10) * 100;
              return (
                <div key={String(label)} className="rounded-xl border border-paper-line bg-paper-line/10 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">{label}</p>
                    <ScorePill score={s} />
                  </div>
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-line/50">
                    <div className="h-full rounded-full bg-accent/50" style={{ width: `${pct}%` }} />
                  </div>
                  {notes && <p className="text-xs text-ink-faint">{safeStr(notes)}</p>}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-paper-line/20 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink">Strengths</h4>
              <ul className="space-y-1">
                {safeArr(candidate.assessmentStrengths).map((s, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink-muted">
                    <span>•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-paper-line/20 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink">Gaps</h4>
              <ul className="space-y-1">
                {safeArr(candidate.assessmentGaps).map((w, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink-muted">
                    <span>•</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
