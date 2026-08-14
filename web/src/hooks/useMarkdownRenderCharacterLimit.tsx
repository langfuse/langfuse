import { createContext, useContext, type ReactNode } from "react";

import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";

const MarkdownRenderCharacterLimitContext = createContext<number>(
  env.NEXT_PUBLIC_LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT,
);

/**
 * Provides the character count above which trace/observation I/O is rendered
 * as plain text instead of markdown: the server's runtime
 * LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT, or the build-time NEXT_PUBLIC_
 * value until fetched. A context (fetched once, in _app) rather than a
 * per-consumer query so story-covered components stay free of tRPC fetches;
 * without a provider, consumers get the build-time default.
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
