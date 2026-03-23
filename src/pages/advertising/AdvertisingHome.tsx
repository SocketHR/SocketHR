import { useState, type FormEvent } from "react";
import { ProductCarousel } from "./ProductCarousel";

function CheckIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function AdvertisingHome() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

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

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitted(true);
  }

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="font-display text-xs font-bold uppercase tracking-[0.4em] text-cyan-400">Get Started</p>
          <h1 className="mt-6 font-display text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl">
            HIRE WITH THE
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-white to-blue-400 bg-clip-text text-transparent">
              SPEED OF AI
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            Automatically rank and respond to every applicant in seconds. Stop manually reviewing resumes and join 200+
            high-growth hiring teams today.
          </p>
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200">
            <span className="text-amber-400">⚡</span>
            Next 100 individuals or companies get a <strong className="font-semibold text-white">15% lifetime discount</strong> on
            the pro plan
          </div>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="#waitlist"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-10 py-4 text-lg font-bold text-white shadow-xl shadow-cyan-500/30 transition hover:scale-[1.02] hover:brightness-110 sm:w-auto"
            >
              Get Early Access
            </a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" id="plans">
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-4xl">
          Choose Your Path to Efficiency
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-400">
          Join 200+ hiring teams who will use SocketAI to revolutionize their recruitment process with Corporate
          Futurism.
        </p>
        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <div className="relative flex flex-col rounded-3xl border border-white/10 bg-zinc-900/40 p-8 backdrop-blur-sm">
            <h3 className="font-display text-xl font-bold text-white">Free Plan</h3>
            <p className="mt-4 font-display text-5xl font-black text-white">
              $0<span className="text-lg font-normal text-zinc-500"></span>
            </p>
            <ul className="mt-8 flex flex-col gap-4 text-zinc-300">
              <li className="flex gap-3">
                <CheckIcon />3 Job Listings/Mo
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                100 resumes max per listing
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                AI Resume Ranking and Basic Dashboard
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                Limited Follow Up Questions to filter through and find specific information in resumes
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                Indeed/Linkedin Multi-Platform Integration
              </li>
            </ul>
            <a
              href="#waitlist"
              className="mt-10 block rounded-2xl border border-white/20 py-4 text-center font-semibold text-white transition hover:bg-white/5"
            >
              SECURE EARLY ACCESS
            </a>
          </div>

          <div className="relative flex flex-col rounded-3xl border-2 border-cyan-500/50 bg-gradient-to-b from-cyan-500/10 to-blue-600/5 p-8 shadow-2xl shadow-cyan-500/20">
            <span className="absolute right-6 top-6 rounded-full bg-cyan-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-black">
              Popular
            </span>
            <h3 className="font-display text-xl font-bold text-white">Pro Plan</h3>
            <p className="mt-4 font-display text-5xl font-black text-white">
              $30<span className="text-xl font-semibold text-zinc-400"> /mo</span>
            </p>
            <ul className="mt-8 flex flex-col gap-4 text-zinc-200">
              <li className="flex gap-3">
                <CheckIcon />
                10 Job Listings/Mo
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                1,000 Resumes Max per Listing
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                Advanced AI Ranking Logic and Dashboard
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                Automatic Email Follow-Up Integration for each Candidate
              </li>
              <li className="flex gap-3">
                <CheckIcon />
                Everything in Free Plan
              </li>
            </ul>
            <a
              href="#waitlist"
              className="mt-10 block rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-4 text-center font-bold text-white shadow-lg transition hover:brightness-110"
            >
              GET PRO PLAN
            </a>
          </div>
        </div>
      </section>

      {/* Evolution */}
      <section className="border-y border-white/10 bg-black/30 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-zinc-500">The Evolution</p>
          <h2 className="mt-4 font-display text-3xl font-bold text-white sm:text-4xl">
            From Manual Grunt Work to Intelligent Automation
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-2 md:items-start">
            <p className="text-lg leading-relaxed text-zinc-400">
              Recruiters today are drowning in hundreds of resumes per role, spending hours on manual screening that often
              misses the best talent. The traditional process is slow, biased, and exhausting for hiring teams.
            </p>
            <p className="text-lg leading-relaxed text-zinc-300">
              SocketAI shifts the paradigm. Our AI engine automatically ranks every applicant in minutes, identifying
              top-tier candidates with precision. By liquidating the manual workload, we empower you to focus on what
              matters: building your dream team.
            </p>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 className="text-center font-display text-3xl font-bold text-white sm:text-4xl">Streamlined Hiring Workflow</h2>
        <div className="mt-16 grid gap-10 md:grid-cols-3">
          {[
            {
              title: "Automated Applicant Ranking",
              body: "Our AI instantly analyzes hundreds of resumes to rank candidates based on your specific role requirements.",
            },
            {
              title: "Instant Response System",
              body: "Automatically engage with every applicant within minutes, ensuring a premium experience for every candidate.",
            },
            {
              title: "Indeed Integration",
              body: "SocketAI plugs directly into your Indeed workflow, managing your inbox without you lifting a finger.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-zinc-900/30 p-8 transition hover:border-cyan-500/30"
            >
              <h3 className="font-display text-lg font-bold text-white">{item.title}</h3>
              <p className="mt-4 leading-relaxed text-zinc-400">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist intro strip */}
      <section className="border-y border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-blue-600/10 to-purple-500/10 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">Get Early Access</h2>
          <p className="mt-4 text-lg text-zinc-300">
            Join 200+ hiring teams and stop manually reviewing resumes. Join our waitlist for free early access to
            SocketAI.
          </p>
        </div>
      </section>

      {/* Waitlist form */}
      <section className="mx-auto max-w-xl px-4 py-24 sm:px-6" id="waitlist">
        <div className="rounded-3xl border border-white/10 bg-zinc-900/50 p-8 shadow-2xl sm:p-10">
          <h2 className="font-display text-center text-2xl font-bold text-white sm:text-3xl">JOIN THE WAITLIST</h2>
          <p className="mt-2 text-center text-sm text-cyan-400/90">Estimated Early Access Launch Mid-End April</p>

          {submitted ? (
            <div className="mt-10 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-10 text-center">
              <p className="text-lg font-semibold text-emerald-300">You’re on the list.</p>
              <p className="mt-2 text-zinc-400">We’ll reach out when early access opens. Launch partners receive a lifetime discount on the Pro Plan.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-5" noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-300">
                    First name <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    placeholder="Jane"
                    autoComplete="given-name"
                  />
                  {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300">
                    Last name <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    placeholder="Doe"
                    autoComplete="family-name"
                  />
                  {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300">Company name</label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  placeholder="Acme Inc."
                  autoComplete="organization"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  placeholder="+1 …"
                  autoComplete="tel"
                />
              </div>
              <button
                type="submit"
                className="mt-4 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-4 text-lg font-bold text-white shadow-lg transition hover:brightness-110"
              >
                Submit
              </button>
              <p className="text-center text-xs text-zinc-500">Launch partners will receive a lifetime discount on the Pro Plan.</p>
            </form>
          )}
        </div>
      </section>

      <ProductCarousel />

      <footer className="border-t border-white/10 py-12 text-center text-sm text-zinc-500">
        <p>© {new Date().getFullYear()} SocketAI. All rights reserved.</p>
        <p className="mt-2">Streamline Hiring with AI · Built for teams using the SocketHR app at sockethr.com</p>
      </footer>
    </>
  );
}
