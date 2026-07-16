import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { type RouterOutputs } from "@/src/utils/api";
import { type SingleValueOption } from "@langfuse/shared";

export type LegacySessionTrace =
  RouterOutputs["sessions"]["byIdWithScores"]["traces"][number];
export type EventSession =
  RouterOutputs["sessions"]["byIdWithScoresFromEvents"];
export type EventSessionTrace =
  RouterOutputs["sessions"]["tracesFromEvents"][number];
export type CommentCounts = Map<string, number>;
export type EventFilterOptions = Record<
  string,
  (string | SingleValueOption)[] | Record<string, string[]> | undefined
>;

export const asCommentCounts = (
  commentCounts: Map<unknown, unknown> | undefined,
): CommentCounts | undefined => commentCounts as CommentCounts | undefined;

export const isMultiValueOptionRecord = (
  value: (string | SingleValueOption)[] | Record<string, string[]> | undefined,
): value is Record<string, string[]> => Boolean(value) && !Array.isArray(value);

export const getStringFilterOptions = (
  value: (string | SingleValueOption)[] | Record<string, string[]> | undefined,
) => {
  if (!Array.isArray(value)) return undefined;

  return value.map((option) =>
    typeof option === "string" ? option : option.value,
  );
};

export const areDetailPageListsEqual = (
  left: ListEntry[] | undefined,
  right: ListEntry[] | undefined,
) => {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    if (entry.id !== other?.id) return false;
    if (!entry.params && !other?.params) return true;
    return JSON.stringify(entry.params) === JSON.stringify(other?.params);
  });
};
