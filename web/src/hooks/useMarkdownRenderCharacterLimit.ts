import { useContext } from "react";

import { MarkdownRenderCharacterLimitContext } from "@/src/components/MarkdownRenderCharacterLimitProvider/MarkdownRenderCharacterLimitContext";

export function useMarkdownRenderCharacterLimit(): number {
  return useContext(MarkdownRenderCharacterLimitContext);
}
