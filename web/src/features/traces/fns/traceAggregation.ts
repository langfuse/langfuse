/**
 * Trace-level metrics aggregation utility
 *
 * Aggregates cost, usage, and observation-level counts from observations
 * for display in headers. Used for both trace-level (all observations) and
 * observation-level (descendants) aggregation.
 */

import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import {
  ObservationLevel,
  type ObservationLevelType,
  type ObservationType,
  isGenerationLike,
} from "@langfuse/shared";
import { type TreeNode } from "../types/treeNode";

export interface AggregatedTraceMetrics {
  totalCost: number | null;
  costDetails: Record<string, number> | undefined;
  totalUsage: number;
  inputUsage: number;
  outputUsage: number;
  usageDetails: Record<string, number> | undefined;
  hasGenerationLike: boolean;
}

/**
 * Aggregates metrics from all observations in a trace.
 *
 * - totalCost: sum of all observation costs (null if no costs)
 * - costDetails: merged breakdown from all observations
 * - usage fields: summed across all generation-like observations
 * - hasGenerationLike: true if any observation is generation-like (for showing usage badge)
 */
export function aggregateTraceMetrics(
  observations: ObservationReturnTypeWithMetadata[],
): AggregatedTraceMetrics {
  let totalCost: number | null = null;
  const costDetails: Record<string, number> = {};
  let totalUsage = 0;
  let inputUsage = 0;
  let outputUsage = 0;
  const usageDetails: Record<string, number> = {};
  let hasGenerationLike = false;

  for (const obs of observations) {
    // Aggregate cost
    if (obs.totalCost != null) {
      totalCost = (totalCost ?? 0) + Number(obs.totalCost);
    }

    // Merge cost details
    if (obs.costDetails) {
      for (const [key, value] of Object.entries(obs.costDetails)) {
        costDetails[key] = (costDetails[key] ?? 0) + value;
      }
    }

    // Only aggregate usage for generation-like observations
    if (isGenerationLike(obs.type as ObservationType)) {
      hasGenerationLike = true;
      totalUsage += obs.totalUsage ?? 0;
      inputUsage += obs.inputUsage ?? 0;
      outputUsage += obs.outputUsage ?? 0;

      // Merge usage details
      if (obs.usageDetails) {
        for (const [key, value] of Object.entries(obs.usageDetails)) {
          usageDetails[key] = (usageDetails[key] ?? 0) + value;
        }
      }
    }
  }

  return {
    totalCost,
    costDetails: Object.keys(costDetails).length > 0 ? costDetails : undefined,
    totalUsage,
    inputUsage,
    outputUsage,
    usageDetails:
      Object.keys(usageDetails).length > 0 ? usageDetails : undefined,
    hasGenerationLike,
  };
}

/** Display order matches the v3 traces-table Observation Levels column. */
const OBSERVATION_LEVEL_DISPLAY_ORDER = [
  ObservationLevel.ERROR,
  ObservationLevel.WARNING,
  ObservationLevel.DEFAULT,
  ObservationLevel.DEBUG,
] as const;

export type ObservationLevelCounts = Record<ObservationLevelType, number>;

export type ObservationLevelCountItem = {
  level: ObservationLevelType;
  count: number;
  /** Lowercase official level name, e.g. `error`. */
  label: string;
  /** Design-system badge color; omit on the header when null. */
  color: "error" | "warning" | null;
};

/**
 * Counts observations by official ObservationLevel.
 *
 * Unknown or missing levels are skipped rather than inventing a fifth
 * bucket — the same total-lookup stance as `getLevelColors`.
 */
export function countObservationLevels(
  observations: ReadonlyArray<{ level?: string | null }>,
): ObservationLevelCounts {
  const counts: ObservationLevelCounts = {
    ERROR: 0,
    WARNING: 0,
    DEFAULT: 0,
    DEBUG: 0,
  };
  for (const observation of observations) {
    const level = observation.level;
    if (level != null && Object.hasOwn(counts, level)) {
      counts[level as ObservationLevelType] += 1;
    }
  }
  return counts;
}

/**
 * Levels to show in the trace header for these counts.
 *
 * ERROR and DEFAULT are always shown when the trace has observations, so
 * success vs failure stays glanceable even when one of them is zero.
 * WARNING and DEBUG appear only when their count is greater than zero.
 */
export function visibleObservationLevelCounts(
  counts: ObservationLevelCounts,
  hasObservations: boolean,
): ObservationLevelCountItem[] {
  if (!hasObservations) return [];
  return OBSERVATION_LEVEL_DISPLAY_ORDER.filter((level) => {
    if (
      level === ObservationLevel.ERROR ||
      level === ObservationLevel.DEFAULT
    ) {
      return true;
    }
    return counts[level] > 0;
  }).map((level) => {
    const count = counts[level];
    return {
      level,
      count,
      label: level.toLowerCase(),
      color: observationLevelCountColor(level, count),
    };
  });
}

function observationLevelCountColor(
  level: ObservationLevelType,
  count: number,
): ObservationLevelCountItem["color"] {
  if (count <= 0) return null;
  if (level === ObservationLevel.ERROR) return "error";
  if (level === ObservationLevel.WARNING) return "warning";
  return null;
}

/**
 * Collects all descendant IDs from a TreeNode using iterative DFS.
 * Does NOT include the node itself - only its descendants.
 */
export function getDescendantIds(node: TreeNode): string[] {
  const ids: string[] = [];
  const stack = [...node.children];
  while (stack.length > 0) {
    const current = stack.pop()!;
    ids.push(current.id);
    stack.push(...current.children);
  }
  return ids;
}
