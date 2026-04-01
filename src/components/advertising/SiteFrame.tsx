"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

export function SiteFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const onBlog = router.pathname.startsWith("/advertising/blog");

  return (
    <div className="min-h-screen bg-[#07060c] font-adv text-zinc-100 antialiased">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.30]"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(120, 119, 198, 0.45), transparent),
            radial-gradient(ellipse 42% 28% at 100% 50%, rgba(59, 130, 246, 0.05), transparent),
            radial-gradient(ellipse 38% 22% at 0% 80%, rgba(236, 72, 153, 0.04), transparent)`,
        }}
      />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07060c]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/advertising" className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
            Socket<span className="text-cyan-400">hr</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/advertising"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                !onBlog ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Home
            </Link>
            <Link
              href="/advertising/blog"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                onBlog ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Blog
            </Link>
            <Link
              href="/"
              className="ml-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-110"
            >
              SocketHR app
            </Link>
          </nav>
        </div>
      </header>
      <main className="relative z-10">{children}</main>
    </div>
  );
}
