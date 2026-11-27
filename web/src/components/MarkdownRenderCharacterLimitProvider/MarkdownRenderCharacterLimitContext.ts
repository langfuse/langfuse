import { createContext } from "react";

import { DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/components/ui/markdown-render-limits";

export const MarkdownRenderCharacterLimitContext = createContext<number>(
  DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT,
);
