/**
 * Row order and group headers for a Scores table that groups by evaluator
 * prefix (trace / observation Scores tabs). Same rule as the chips
 * (groupScoresForChips): names sharing the prefix before the first `.`, `:`
 * or `/` form a group once two distinct names share it. Grouped rows come
 * first, groups alphabetical, metric name within; rows of no group follow in
 * their incoming order under no header.
 */

import {
  groupScoresForChips,
  groupSummary,
  metricLabel,
  type SummarizableScore,
} from "@/src/components/ScoreBadge/groupScoresForChips";

export type ScoreRowGroup = {
  prefix: string;
  /** Distinct metric names, the count the chip shows. */
  count: number;
  /** Same text as the chip (groupSummary); null when there is none. */
  summary: string | null;
};

export type GroupedScoreRows<T> = {
  rows: T[];
  /** Header to render above the row with this id: the group's first row. */
  headerBefore: Map<string, ScoreRowGroup>;
  /** Group prefix by row id; absent for rows under no header. */
  groupOf: Map<string, string>;
};

export function groupScoreRowsByEvaluator<
  T extends { id: string; name: string },
>(
  rows: ReadonlyArray<T>,
  /** The typed value behind a row, for the summary; table rows stringify it. */
  asScore: (row: T) => SummarizableScore,
): GroupedScoreRows<T> {
  const ordered: T[] = [];
  const headerBefore = new Map<string, ScoreRowGroup>();
  const groupOf = new Map<string, string>();
  const ungrouped: T[] = [];

  for (const group of groupScoresForChips(rows)) {
    if (group.kind !== "evaluator") {
      ungrouped.push(...group.scores);
      continue;
    }
    const { count, text } = groupSummary({
      ...group,
      scores: group.scores.map(asScore),
    });
    const members = [...group.scores].sort((a, b) => {
      const [left, right] = [metricLabel(a.name), metricLabel(b.name)];
      return left < right ? -1 : left > right ? 1 : 0;
    });
    headerBefore.set(members[0]!.id, {
      prefix: group.label,
      count,
      summary: text,
    });
    for (const row of members) groupOf.set(row.id, group.label);
    ordered.push(...members);
  }

  // Incoming order (the table's sort), not the alphabetical chip order.
  const ungroupedIds = new Set(ungrouped.map((row) => row.id));
  ordered.push(...rows.filter((row) => ungroupedIds.has(row.id)));

  return { rows: ordered, headerBefore, groupOf };
}
