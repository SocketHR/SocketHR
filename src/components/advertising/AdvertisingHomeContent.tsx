"use client";

import { useState, type FormEvent } from "react";
import { useSockethrRuntimeConfig } from "../../lib/useSockethrRuntimeConfig";

const WAITLIST_NOTES_MAX_LENGTH = 500;

const features = [
  {
    title: "Instant Resume Intelligence",
    body: "Upload hundreds of resumes. SocketHR reads every one, extracts key data, and ranks candidates against your exact job requirements with written rationale and fit summaries.",
  },
  {
    title: "10-Minute Case Simulations",
    body: "Candidates face adaptive scenarios: an initial challenge followed by a twist that forces them to change course. You see how they think, not how well they rehearsed.",
  },
  {
    title: "Judgment & Prioritization",
    body: "Candidates rank real competing tasks under a timer. Role-specific situations with no obvious correct order reveal how they actually approach the job.",
  },
  {
    title: "Predictive Composite Ranking",
    body: "Resume score, simulation score, and interview notes combine into one live ranking. The pipeline re-sorts automatically as new evidence comes in.",
  },
  {
    title: "AI-Scored Interview Notes",
    body: "Add post-interview notes and SocketHR scores them against the role, updating the candidate's ranking in real time.",
  },
  {
    title: "Editable Simulations",
    body: "Review every simulation before it is sent. Remove questions, reprompt scenarios, and tune assessments until they fit the role.",
  },
  {
    title: "6-Dimension Performance Report",
    body: "After each simulation, see a breakdown across communication, sales acumen, situational judgment, customer empathy, ethics, and role fit.",
  },
  {
    title: "Manual Rank Override",
    body: "AI ranking is a starting point. Override any candidate's score with your own judgment and the pipeline updates instantly.",
  },
  {
    title: "Hiring Intelligence Chat",
    body: "Ask AI anything about a candidate, grounded in their resume, simulation, interview notes, and actual hiring data.",
  },
];

const comparisonRows = [
  ["Onboarding time", "4-8 weeks", "3-6 weeks", "< 10 minutes"],
  ["Ease of use", "Complex, IT required", "Moderate setup", "No-code, intuitive"],
  ["Candidate ranking", "Manual review", "Manual review", "AI-scored, auto-ranked"],
  ["Performance prediction", "None", "None", "10-min adaptive simulation"],
  ["Interview tools", "Structured scorecards", "Interview kits", "Sim + notes + AI scoring"],
  ["Simulation report", "None", "None", "6-dimension breakdown"],
  ["Resume parsing", "Basic ATS fields", "Basic ATS fields", "Full AI analysis + scoring"],
  ["Manual rank override", "None", "None", "1-click with tracking"],
  ["Time to shortlist", "2-5 days", "2-5 days", "Under 10 minutes"],
];

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function AdvertisingHomeContent() {
  const { apiBase, configLoaded } = useSockethrRuntimeConfig();
  const waitlistPostUrl = `${apiBase.replace(/\/$/, "")}/api/waitlist`;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function validate() {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Required";
    if (!lastName.trim()) e.lastName = "Required";
    const em = email.trim();
    if (!em) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) e.email = "Enter a valid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setSubmitError("");
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(waitlistPostUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          company: company.trim(),
          email: email.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="relative overflow-hidden px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.9)]" />
            AI-powered ATS
          </div>
          <h1 className="font-display text-5xl font-black leading-[0.96] tracking-tight text-white sm:text-7xl md:text-8xl">
            Don't ask what candidates
            <br />
            have done.
            <br />
            <span className="bg-gradient-to-r from-cyan-200 via-white to-blue-200 bg-clip-text text-transparent">
              Simulate what they'll do.
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
            An ATS that automatically ranks and responds to every applicant in seconds, then predicts how they will
            actually perform on the job.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
            Replace hour-long interviews with 10-minute simulations. Shift from ranking resumes to ranking real performance.
          </p>
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100">
            Next 100 companies get a <strong className="font-bold text-white">15% lifetime discount</strong> on Pro.
            <a href="#waitlist" className="text-cyan-300 underline underline-offset-4 hover:text-white">Claim yours</a>
          </div>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="#waitlist" className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-9 py-4 text-base font-black text-black shadow-xl shadow-cyan-400/20 transition hover:bg-cyan-300 sm:w-auto">
              Start hiring smarter
            </a>
            <a href="/" className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 px-9 py-4 text-base font-semibold text-zinc-200 transition hover:border-cyan-300/50 hover:text-white sm:w-auto">
              Open product demo
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6 text-center shadow-2xl shadow-cyan-950/30">
          <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">Backed by research</p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300">
            Schmidt and Hunter's landmark meta-analysis found that work samples predict job performance with up to
            <span className="font-bold text-white"> 2x the validity </span>
            of traditional interviews. Resumes alone are among the weakest predictors.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Deloitte Human Capital Trends found that organizations using AI-based predictive assessments improved hiring
            accuracy by <span className="font-bold text-white">41%</span> and reduced first-year attrition by
            <span className="font-bold text-white"> 27%</span>.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-center font-display text-xs font-bold uppercase tracking-[0.35em] text-cyan-400">
          Everything in the platform
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl text-center font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
          More than an ATS. A hiring intelligence system.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-zinc-500">
          Every feature is built around one question: who will actually succeed in this role?
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {features.map((item, index) => (
            <article key={item.title} className="rounded-3xl border border-white/10 bg-zinc-950/60 p-6 transition hover:border-cyan-400/30 hover:bg-zinc-900/70">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 font-display text-sm font-black text-cyan-300">
                {String(index + 1).padStart(2, "0")}
              </div>
              <h3 className="font-display text-lg font-bold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-cyan-400/10 via-blue-500/10 to-transparent p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">Setup & onboarding</p>
            <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
              Up and running in minutes.
              <span className="block text-xl font-normal text-zinc-400 sm:text-2xl">Other ATS systems take weeks.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
              SocketHR is designed to be intuitive from day one. Post a job, upload resumes, and have a ranked,
              simulation-tested pipeline in under 10 minutes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5 text-center">
              <p className="font-display text-2xl font-black text-zinc-500">Weeks</p>
              <p className="mt-1 text-xs text-zinc-500">Other ATS</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-5 text-center">
              <p className="font-display text-2xl font-black text-cyan-300">&lt; 10 min</p>
              <p className="mt-1 text-xs text-zinc-500">SocketHR</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-black tracking-tight text-white sm:text-4xl">
          Built to replace what came before.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-sm text-zinc-500">
          Greenhouse and Lever are resume trackers. SocketHR is a performance predictor.
        </p>
        <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/70">
          <div className="grid grid-cols-4 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-zinc-500">
            <div className="p-4">Feature</div>
            <div className="border-l border-white/10 p-4">Greenhouse</div>
            <div className="border-l border-white/10 p-4">Lever</div>
            <div className="border-l border-white/10 p-4 text-cyan-300">SocketHR</div>
          </div>
          {comparisonRows.map(([feature, greenhouse, lever, socket]) => (
            <div key={feature} className="grid grid-cols-4 border-b border-white/10 text-sm last:border-0">
              <div className="p-4 font-semibold text-zinc-300">{feature}</div>
              <div className="border-l border-white/10 p-4 text-zinc-600">{greenhouse}</div>
              <div className="border-l border-white/10 p-4 text-zinc-600">{lever}</div>
              <div className="flex items-center gap-2 border-l border-white/10 p-4 text-emerald-300">
                <CheckIcon />
                {socket}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-xl px-4 py-20 sm:px-6" id="waitlist">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/75 p-8 shadow-2xl shadow-cyan-950/40 sm:p-10">
          <h2 className="text-center font-display text-3xl font-black tracking-tight text-white">Get early access</h2>
          <p className="mt-3 text-center text-sm leading-relaxed text-zinc-400">
            Stop guessing. Start knowing. SocketHR gives you performance data before day one.
          </p>

          {submitted ? (
            <div className="mt-10 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-6 py-10 text-center">
              <p className="text-lg font-semibold text-emerald-200">You are on the list.</p>
              <p className="mt-2 text-zinc-400">We will reach out when early access opens.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-5" noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-300">First name <span className="text-red-300">*</span></label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20" placeholder="Jane" autoComplete="given-name" />
                  {errors.firstName && <p className="mt-1 text-xs text-red-300">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300">Last name <span className="text-red-300">*</span></label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20" placeholder="Doe" autoComplete="family-name" />
                  {errors.lastName && <p className="mt-1 text-xs text-red-300">{errors.lastName}</p>}
                </div>
              </div>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20" placeholder="Company name" autoComplete="organization" />
              <div>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20" placeholder="you@company.com" autoComplete="email" />
                {errors.email && <p className="mt-1 text-xs text-red-300">{errors.email}</p>}
              </div>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20" placeholder="Phone (optional)" autoComplete="tel" />
              <div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={WAITLIST_NOTES_MAX_LENGTH} className="min-h-28 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20" placeholder="Anything we should know about your hiring goals?" />
                <p className="mt-1 text-right text-xs text-zinc-600">{notes.length}/{WAITLIST_NOTES_MAX_LENGTH}</p>
              </div>
              {submitError && <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-center text-sm text-red-200">{submitError}</p>}
              <button type="submit" disabled={isSubmitting || !configLoaded} className="w-full rounded-2xl bg-cyan-400 py-4 text-lg font-black text-black shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? "Sending..." : "Submit"}
              </button>
              <p className="text-center text-xs text-zinc-600">No credit card required. Launch partners receive the lifetime discount.</p>
            </form>
          )}
        </div>
      </section>

      <footer className="border-t border-white/10 py-12 text-center text-sm text-zinc-500">
        <p>© {new Date().getFullYear()} SocketHR. All rights reserved.</p>
      </footer>
    </>
  );
}
