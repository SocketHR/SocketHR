import { useCallback, useEffect, useState } from "react";

const SLIDES = [
  {
    n: "01",
    title: "AI Candidate Ranking",
    blurb: "Instantly see top talent ranked by AI.",
  },
  {
    n: "02",
    title: "Built In Multi-App Integration",
    blurb: "Respond to every applicant in minutes.",
  },
  {
    n: "03",
    title: "AI Search Chat",
    blurb: "Deep insights into every applicant's potential.",
  },
  {
    n: "04",
    title: "Automatic Email Follow-Ups",
    blurb: "Unified hiring platform for your entire organization.",
  },
];

export function ProductCarousel() {
  const [i, setI] = useState(0);
  const next = useCallback(() => setI((x) => (x + 1) % SLIDES.length), []);
  const prev = useCallback(() => setI((x) => (x - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    const id = window.setInterval(next, 6500);
    return () => window.clearInterval(id);
  }, [next]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  };

  return (
    <section
      className="mx-auto max-w-6xl px-4 pb-24 sm:px-6"
      aria-roledescription="carousel"
      aria-label="Product interface highlights"
    >
      <p className="font-display text-center text-xs font-bold uppercase tracking-[0.35em] text-cyan-400/90">
        Product Interface
      </p>
      <h2 className="mt-3 text-center font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
        The Future of Hiring Interface
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-400">
        Explore how SocketAI transforms your recruitment workflow with a focus on speed, precision, and effortless
        candidate management.
      </p>

      <div
        className="relative mt-12 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/90 to-[#0c0a14] p-1 shadow-2xl shadow-cyan-500/10"
        onKeyDown={onKey}
        tabIndex={0}
      >
        <div className="flex min-h-[280px] flex-col justify-between gap-8 rounded-[1.35rem] bg-[#080712] p-8 sm:min-h-[240px] sm:flex-row sm:items-center sm:p-12">
          <div className="max-w-xl">
            <span className="font-display text-6xl font-black leading-none text-white/10 sm:text-7xl">
              {SLIDES[i].n}
            </span>
            <h3 className="-mt-4 font-display text-2xl font-bold text-white sm:text-3xl">{SLIDES[i].title}</h3>
            <p className="mt-3 text-lg text-zinc-400">{SLIDES[i].blurb}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:items-end">
            <div className="flex h-36 w-full max-w-sm items-center justify-center rounded-2xl border border-dashed border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-600/5 sm:h-44">
              <div className="text-center text-sm text-zinc-500">
                <span className="block text-3xl opacity-40">◆</span>
                <span className="mt-2 block font-medium text-cyan-400/80">Live preview</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/5 bg-black/20 px-4 py-3 sm:px-6">
          <div className="flex gap-2">
            {SLIDES.map((s, idx) => (
              <button
                key={s.n}
                type="button"
                onClick={() => setI(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === i ? "w-8 bg-cyan-400" : "w-2 bg-zinc-600 hover:bg-zinc-500"
                }`}
                aria-label={`Slide ${s.n}: ${s.title}`}
                aria-current={idx === i}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={prev}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/20"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
