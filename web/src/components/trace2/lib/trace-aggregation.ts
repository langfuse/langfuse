/**
 * Trace-level metrics aggregation utility
 *
 * Aggregates cost and usage data from observations for display in headers.
 * Used for both trace-level (all observations) and observation-level (descendants) aggregation.
 */

import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ObservationType, isGenerationLike } from "@langfuse/shared";
import { type TreeNode } from "./types";

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
