import { type projectMarkdownToRenderedText } from "./projectMarkdownToRenderedText";

export type ProjectedMarkdownText = ReturnType<
  typeof projectMarkdownToRenderedText
>;

export function getMarkdownSourceRangeFromRenderedOffsets(
  projection: ProjectedMarkdownText,
  plainStart: number,
  plainEnd: number,
) {
  if (plainStart < 0 || plainEnd <= plainStart) {
    return null;
  }

  const sourceStart = projection.sourceByPlainIndex[plainStart];
  const sourceEnd = projection.sourceByPlainIndex[plainEnd - 1];
  if (sourceStart === undefined || sourceEnd === undefined) {
    return null;
  }

  return { start: sourceStart, end: sourceEnd + 1 };
}
