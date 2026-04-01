import type { GetServerSideProps } from "next";
import { getPostBySlug } from "../../../data/sockethrBlogPosts";
import { BlogPostContent } from "../../../components/advertising/BlogPostContent";
import { SiteFrame } from "../../../components/advertising/SiteFrame";

export default function AdvertisingBlogPostPage({ slug }: { slug: string }) {
  return (
    <SiteFrame>
      <BlogPostContent slug={slug} />
    </SiteFrame>
  );
}

export const getServerSideProps: GetServerSideProps<{ slug: string }> = async (ctx) => {
  const slug = String(ctx.params?.slug || "");
  if (!getPostBySlug(slug)) {
    return { notFound: true };
  }
  return {
    props: { slug },
  };
};
