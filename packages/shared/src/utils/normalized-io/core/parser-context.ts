import type { IOConvention } from "../conventions/io-convention";

/**
 * Mutable state for parsing one observation side. Input is conversation
 * history and therefore keeps every tool call; output is the side projected
 * into the legacy tool columns and deduplicates repeated representations.
 */
export type ParserContext =
  | {
      source: "input";
      hasSystemMessage: boolean;
      preferredProvider?: IOConvention;
    }
  | {
      source: "output";
      toolCallKeys: Set<string>;
      preferredProvider?: IOConvention;
    };

export function createParserContext(source: "input" | "output"): ParserContext {
  return source === "input"
    ? { source, hasSystemMessage: false }
    : { source, toolCallKeys: new Set<string>() };
}
