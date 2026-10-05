import { deepParseJson, type ScoreDomain } from "@langfuse/shared";
import { getMostRecentCorrection } from "@/src/features/corrections";
import { countJsonRows } from "../AdvancedJsonViewer/utils/rowCount";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  JSON_VIEW_RENDER_ROW_LIMIT,
  probeJsonField,
} from "../IOPreview/fns/jsonViewSizeGate";

export function selectOutputCorrections(
  corrections: ScoreDomain[],
  observationId: string,
  ownsTraceLevelScores: boolean,
) {
  return {
    outputCorrection: getMostRecentCorrection(
      corrections.filter(
        (correction) => correction.observationId === observationId,
      ),
    ),
    traceOutputCorrection: ownsTraceLevelScores
      ? getMostRecentCorrection(
          corrections.filter((correction) => !correction.observationId),
        )
      : undefined,
  };
}

export function isCorrectionOutputTooLarge(
  output: unknown,
  parsedOutput?: unknown,
) {
  if (probeJsonField(output).size > JSON_VIEW_RENDER_CHAR_LIMIT) return true;
  return (
    countJsonRows(parsedOutput ?? deepParseJson(output)) >
    JSON_VIEW_RENDER_ROW_LIMIT
  );
}

export function prepareTraceCorrectionOutput(output: unknown) {
  if (probeJsonField(output).size > JSON_VIEW_RENDER_CHAR_LIMIT) {
    return { actualOutput: undefined, actualOutputTooLarge: true };
  }

  const parsedOutput = deepParseJson(output);
  const actualOutputTooLarge =
    countJsonRows(parsedOutput) > JSON_VIEW_RENDER_ROW_LIMIT;
  return {
    actualOutput: actualOutputTooLarge ? undefined : parsedOutput,
    actualOutputTooLarge,
  };
}
