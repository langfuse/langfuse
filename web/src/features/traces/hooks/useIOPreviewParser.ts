/* eslint-disable no-nested-ternary */
import { useMemo } from "react";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { normalizeSpanIO } from "@langfuse/shared/src/utils/normalized-io";
import { reportError } from "@/src/utils/reportError";
import { toIOPreview } from "../parsers/toIOPreview";
import { type ChatMLParserResult } from "./useChatMLParser";
import { isOnlyJsonMessage } from "../fns/chatMessageUtils";

/** The same message-level displayability check used by the pretty preview. */
export function hasRenderableChatMessages(result: ChatMLParserResult): boolean {
  return (
    result.canDisplayAsChat && !result.allMessages.every(isOnlyJsonMessage)
  );
}

/**
 * Parses observation I/O into the contract rendered by the Formatted view.
 *
 * A precomputed result wins so surfaces that already parsed (the session
 * feed) are not parsed twice. Parsing is best-effort: a payload the parser
 * cannot handle yields no chat messages and the view falls back to JSON. The
 * parser is not expected to throw; if it does, that is a parser bug worth a
 * Sentry issue, and the view still falls back to JSON.
 */
export function useIOPreviewParser(
  input: Prisma.JsonValue | undefined,
  output: Prisma.JsonValue | undefined,
  metadata: Prisma.JsonValue | undefined,
  preParsedInput?: unknown,
  preParsedOutput?: unknown,
  preParsedMetadata?: unknown,
  preParsedResult?: ChatMLParserResult,
): ChatMLParserResult {
  const parsedInput = preParsedResult
    ? undefined
    : preParsedInput !== undefined
      ? preParsedInput
      : deepParseJson(input, { maxSize: 300_000, maxDepth: 25 });
  const parsedOutput = preParsedResult
    ? undefined
    : preParsedOutput !== undefined
      ? preParsedOutput
      : deepParseJson(output, { maxSize: 300_000, maxDepth: 25 });
  const parsedMetadata = preParsedResult
    ? undefined
    : preParsedMetadata !== undefined
      ? preParsedMetadata
      : deepParseJson(metadata, { maxSize: 100_000, maxDepth: 25 });

  return useMemo<ChatMLParserResult>(() => {
    if (preParsedResult) return preParsedResult;

    const span = {
      input: parsedInput,
      output: parsedOutput,
      metadata: parsedMetadata,
    };
    try {
      return toIOPreview(normalizeSpanIO(span));
    } catch (error) {
      reportError(error, { area: "io-preview-parser" });
      return toIOPreview({ messages: [], toolDefinitions: [], span });
    }
  }, [preParsedResult, parsedInput, parsedOutput, parsedMetadata]);
}
