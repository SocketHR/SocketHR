import Link from "next/link";
import { SOCKETAI_BLOG_POSTS } from "../../data/socketaiBlogPosts";

function formatDate(iso: string) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function BlogIndexContent() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
      <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-cyan-400">Blog</p>
      <h1 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">SocketAI insights</h1>
      <p className="mt-4 text-lg text-zinc-400">
        Streamline your recruitment process with ideas on AI hiring, waitlists, and product updates.
      </p>
      <ul className="mt-14 flex flex-col gap-10">
        {SOCKETAI_BLOG_POSTS.map((post) => (
          <li key={post.slug}>
            <article className="group rounded-2xl border border-white/10 bg-zinc-900/40 p-8 transition hover:border-cyan-500/40">
              <time className="text-sm text-zinc-500">{formatDate(post.date)}</time>
              <h2 className="mt-2 font-display text-2xl font-bold text-white group-hover:text-cyan-300">
                <Link href={`/advertising/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              <p className="mt-3 leading-relaxed text-zinc-400">{post.excerpt}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                <span>{post.readMinutes} min read</span>
                <span aria-hidden>·</span>
                <Link href={`/advertising/blog/${post.slug}`} className="font-semibold text-cyan-400 transition group-hover:text-cyan-300">
                  Read article →
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
