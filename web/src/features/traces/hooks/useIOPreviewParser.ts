import { useMemo } from "react";
import { type Prisma, deepParseJson } from "@langfuse/shared";
import { normalizeSpanIO } from "@langfuse/shared/src/utils/normalized-io";
import { toIOPreview } from "../parsers/toIOPreview";
import { parseChatML, type ChatMLParserResult } from "./useChatMLParser";

export type IOPreviewParserMode = "legacy" | "normalized";

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

  return useMemo(() => {
    // Precomputed results win regardless of parser mode; surfaces that supply
    // one disable the normalized-beta tab (see IOPreview) so labels stay honest.
    if (preParsedResult) return preParsedResult;

    const parseLegacy = () =>
      parseChatML(parsedInput, parsedOutput, parsedMetadata, observationName);

    if (parser === "legacy") return parseLegacy();

    try {
      const normalized = normalizeSpanIO({
        input: parsedInput,
        output: parsedOutput,
        metadata: parsedMetadata,
      });
      return toIOPreview(normalized, parsedInput);
    } catch {
      return parseLegacy();
    }
  }, [
    parser,
    preParsedResult,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    observationName,
  ]);
}
