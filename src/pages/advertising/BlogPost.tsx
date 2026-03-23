import { Link, Navigate, useParams } from "react-router-dom";
import { getPostBySlug, type BlogBlock } from "../../data/socketaiBlogPosts";

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function BlockView({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "p":
      return <p className="mt-6 leading-relaxed text-zinc-300 first:mt-0">{block.text}</p>;
    case "h2":
      return (
        <h2 className="mt-14 font-display text-2xl font-bold text-white first:mt-0 sm:text-3xl">{block.text}</h2>
      );
    case "h3":
      return <h3 className="mt-8 font-display text-xl font-semibold text-white">{block.text}</h3>;
    case "ul":
      return (
        <ul className="mt-4 list-none space-y-3 text-zinc-300">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

export function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = getPostBySlug(slug);

  if (!post) {
    return <Navigate to="/advertising/blog" replace />;
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Link
        to="/advertising/blog"
        className="inline-flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300"
      >
        ← Back to blog
      </Link>
      <header className="mt-8 border-b border-white/10 pb-10">
        <time className="text-sm text-zinc-500">{formatDate(post.date)}</time>
        <h1 className="mt-4 font-display text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 text-zinc-400">{post.readMinutes} min read</p>
      </header>
      <div className="prose-adv pb-16 pt-10">
        {post.blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>
    </article>
  );
}
