import {
  type CloudRegionName,
  isRegionProduction,
} from "@/src/features/organizations/cloudRegions";

/**
 * Every region serves the same sign-in page, and the sign-in page is reached
 * with a `targetPath` query from shared traces. Google therefore sees many
 * URLs for one page and picks one of them; the canonical names that one page
 * so the choice is not left to the crawler.
 */
const CANONICAL_CLOUD_ORIGIN = "https://cloud.langfuse.com";

type PageMetadata = {
  title: string;
  description?: string;
  canonicalUrl?: string;
};

const cloudAuthPages: Record<string, PageMetadata> = {
  "/auth/sign-in": {
    title: "Sign in | Langfuse Cloud",
    description:
      "Sign in to Langfuse Cloud, the open-source LLM engineering platform for tracing, evaluation, and prompt management. EU, US, Japan, and HIPAA data regions.",
  },
  "/auth/sign-up": {
    title: "Sign up | Langfuse Cloud",
    description:
      "Create a free Langfuse Cloud account. No credit card required. Trace, evaluate, and manage prompts for your LLM application.",
  },
  "/auth/reset-password": {
    title: "Reset password | Langfuse Cloud",
    description: "Reset the password of your Langfuse Cloud account.",
  },
};

const selfHostedAuthPages: Record<string, PageMetadata> = {
  "/auth/sign-in": {
    title: "Sign in | Langfuse",
    description:
      "Sign in to Langfuse, the open-source LLM engineering platform for tracing, evaluation, and prompt management.",
  },
  "/auth/sign-up": {
    title: "Sign up | Langfuse",
    description: "Create a Langfuse account.",
  },
  "/auth/reset-password": {
    title: "Reset password | Langfuse",
    description: "Reset the password of your Langfuse account.",
  },
};

const defaultMetadata: PageMetadata = { title: "Langfuse" };

/**
 * Metadata that must be in the server-rendered HTML. Pages own their own
 * `<Head>`, but the auth pages render behind the session gate and never reach
 * the server response, so crawlers only see what is emitted here.
 *
 * `pathname` is the Next.js route (no query string), which is what makes the
 * canonical drop `?targetPath=`.
 */
export function getPageMetadata(
  pathname: string,
  region: CloudRegionName | undefined,
): PageMetadata {
  if (!region) return selfHostedAuthPages[pathname] ?? defaultMetadata;

  const metadata = cloudAuthPages[pathname];
  if (!metadata) return defaultMetadata;

  // Staging and dev share the page but must not point Google at production.
  if (!isRegionProduction(region)) return metadata;

  return { ...metadata, canonicalUrl: `${CANONICAL_CLOUD_ORIGIN}${pathname}` };
}
