import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";

/**
 * Character count above which trace/observation I/O is rendered as plain text
 * instead of markdown. Fetched from the server so
 * LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT works as a plain runtime env var on
 * prebuilt Docker images; until it resolves, falls back to the build-time
 * NEXT_PUBLIC_ value (the 150_000 default on prebuilt images).
 */
export function useMarkdownRenderCharacterLimit(): number {
  const config = api.public.markdownRenderConfig.useQuery(undefined, {
    staleTime: Infinity,
  });
  return (
    config.data?.characterLimit ??
    env.NEXT_PUBLIC_LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT
  );
}
