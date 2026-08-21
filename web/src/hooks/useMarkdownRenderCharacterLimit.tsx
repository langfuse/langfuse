import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/components/ui/markdown-render-limits";
import { api } from "@/src/utils/api";

const MarkdownRenderCharacterLimitContext = createContext<number>(
  DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT,
);

/**
 * Provides the character count above which trace/observation I/O is rendered
 * as plain text instead of markdown. A context (fetched once, in _app) rather
 * than a per-consumer query keeps story-covered components free of tRPC
 * fetches; consumers use the default until the runtime server value is fetched.
 */
export function MarkdownRenderCharacterLimitProvider({
  children,
}: {
  children: ReactNode;
}) {
  const config = api.public.markdownRenderConfig.useQuery(undefined, {
    staleTime: Infinity,
    // Failure is harmless (the default applies), so settle after
    // the initial attempt instead of retrying on every window focus — same
    // guard as the other app-shell config queries (see checkUpdate).
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    throwOnError: false,
  });

  return (
    <MarkdownRenderCharacterLimitContext.Provider
      value={
        config.data?.characterLimit ?? DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT
      }
    >
      {children}
    </MarkdownRenderCharacterLimitContext.Provider>
  );
}

export function useMarkdownRenderCharacterLimit(): number {
  return useContext(MarkdownRenderCharacterLimitContext);
}
