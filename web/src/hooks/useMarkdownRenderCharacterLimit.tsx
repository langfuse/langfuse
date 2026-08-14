import { createContext, useContext, type ReactNode } from "react";

import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";

const MarkdownRenderCharacterLimitContext = createContext<number>(
  env.NEXT_PUBLIC_LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT,
);

/**
 * Provides the character count above which trace/observation I/O is rendered
 * as plain text instead of markdown. Fetched from the server so
 * LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT works as a plain runtime env var on
 * prebuilt Docker images; until it resolves, the build-time NEXT_PUBLIC_ value
 * applies (the 150_000 default on prebuilt images).
 *
 * Delivered via context (fetched once here, in _app) rather than a
 * per-consumer query so story-covered presentational components like
 * PrettyJsonView stay free of tRPC fetches — without a provider, consumers get
 * the build-time default.
 */
export function MarkdownRenderCharacterLimitProvider({
  children,
}: {
  children: ReactNode;
}) {
  const config = api.public.markdownRenderConfig.useQuery(undefined, {
    staleTime: Infinity,
  });

  return (
    <MarkdownRenderCharacterLimitContext.Provider
      value={
        config.data?.characterLimit ??
        env.NEXT_PUBLIC_LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT
      }
    >
      {children}
    </MarkdownRenderCharacterLimitContext.Provider>
  );
}

export function useMarkdownRenderCharacterLimit(): number {
  return useContext(MarkdownRenderCharacterLimitContext);
}
