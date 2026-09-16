import { useMemo } from "react";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { normalizeSpanIO } from "@langfuse/shared/src/utils/normalized-io";
import { toIOPreview } from "../parsers/toIOPreview";
import { parseChatML, type ChatMLParserResult } from "./useChatMLParser";
import { isOnlyJsonMessage } from "../fns/chatMessageUtils";

export type IOPreviewParserMode = "legacy" | "normalized";
export type IOPreviewParserComparisonOutcome =
  | "both"
  | "normalized_only"
  | "legacy_only"
  | "neither";

export interface IOPreviewParserResult {
  result: ChatMLParserResult;
  comparisonOutcome?: IOPreviewParserComparisonOutcome;
}

/** The same message-level displayability check used by the pretty preview. */
export function hasRenderableChatMessages(result: ChatMLParserResult): boolean {
  return (
    result.canDisplayAsChat && !result.allMessages.every(isOnlyJsonMessage)
  );
}

export function selectIOPreviewParserResult(
  normalizedResult: ChatMLParserResult | undefined,
  legacyResult: ChatMLParserResult,
): IOPreviewParserResult {
  const normalizedWorks =
    normalizedResult !== undefined &&
    hasRenderableChatMessages(normalizedResult);
  const legacyWorks = hasRenderableChatMessages(legacyResult);

  if (normalizedWorks && legacyWorks) {
    return {
      result: normalizedResult,
      comparisonOutcome: "both",
    };
  }

  if (normalizedWorks) {
    return {
      result: normalizedResult,
      comparisonOutcome: "normalized_only",
    };
  }

  if (legacyWorks) {
    return {
      result: legacyResult,
      comparisonOutcome: "legacy_only",
    };
  }

  return {
    // Keep normalized data when available so tool definitions and other
    // extracted details remain visible while the UI falls back to JSON.
    result: normalizedResult ?? legacyResult,
    comparisonOutcome: "neither",
  };
}

/**
 * Selects the parser used by the pretty I/O preview.
 *
 * Both parsers return the same ChatMLParserResult, so the rendering tree does
 * not need to know which representation produced it. A normalized parse is
 * deliberately best-effort: malformed or unsupported data falls back to the
 * established parser for this observation.
 */
export function useIOPreviewParser(
  parser: IOPreviewParserMode,
  input: Prisma.JsonValue | undefined,
  output: Prisma.JsonValue | undefined,
  metadata: Prisma.JsonValue | undefined,
  observationName: string | undefined,
  preParsedInput?: unknown,
  preParsedOutput?: unknown,
  preParsedMetadata?: unknown,
  preParsedResult?: ChatMLParserResult,
): IOPreviewParserResult {
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

  return useMemo<IOPreviewParserResult>(() => {
    // Precomputed results win regardless of parser mode; surfaces that supply
    // one disable the normalized-beta tab (see IOPreview) so labels stay honest.
    if (preParsedResult) return { result: preParsedResult };

    const parseLegacy = () =>
      parseChatML(parsedInput, parsedOutput, parsedMetadata, observationName);

    if (parser === "legacy") return { result: parseLegacy() };

    let normalizedResult: ChatMLParserResult | undefined;
    try {
      const normalized = normalizeSpanIO({
        input: parsedInput,
        output: parsedOutput,
        metadata: parsedMetadata,
      });
      normalizedResult = toIOPreview(normalized, parsedInput);
    } catch {
      // The legacy parser remains the visible fallback for malformed input.
    }

    const legacyResult = parseLegacy();

    return selectIOPreviewParserResult(normalizedResult, legacyResult);
  }, [
    parser,
    preParsedResult,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    observationName,
  ]);
}
