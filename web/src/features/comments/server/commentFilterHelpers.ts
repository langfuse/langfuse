import type { PrismaClient } from "@langfuse/shared/src/db";
import { type singleFilter } from "@langfuse/shared";
import {
  type CommentObjectType,
  applyCommentFiltersToFilterState,
  CommentFilterThresholdExceededError,
  COMMENT_FILTER_THRESHOLD,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import type { z } from "zod/v4";

/**
 * Re-export the threshold constant for backward compatibility
 */
export { COMMENT_FILTER_THRESHOLD };

/**
 * Validates that the number of object IDs is within acceptable limits.
 * Throws a user-friendly TRPCError if threshold is exceeded.
 */
export function validateObjectIdCount(
  objectIds: string[],
  objectType: CommentObjectType,
): void {
  if (objectIds.length > COMMENT_FILTER_THRESHOLD) {
    const objectTypePlural = objectType.toLowerCase() + "s";
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Comment filter matches ${objectIds.length.toLocaleString()} ${objectTypePlural} (limit: ${COMMENT_FILTER_THRESHOLD.toLocaleString()}). Please add additional filters to narrow your search.`,
    });
  }
}

/**
 * Processes comment filters from filter state and returns the updated filter state
 * with matching object IDs injected. This abstracts the duplicated logic across
 * all endpoints (traces, sessions, observations).
 *
 * This is a web-specific wrapper around the shared applyCommentFiltersToFilterState
 * that converts CommentFilterThresholdExceededError to TRPCError.
 *
 * @returns Object with:
 *   - filterState: Updated filter state with comment filters replaced by object ID filter
 *   - hasNoMatches: true if comment filters were present but matched nothing (caller should return empty result)
 *   - matchingIds: The object IDs matching comment filters (null if no comment filters). Useful for
 *                  cases that need to intersect with another ID list (e.g., metrics endpoint).
 *
 * @example
 * const { filterState, hasNoMatches } = await applyCommentFilters({
 *   filterState: input.filter ?? [],
 *   prisma: ctx.prisma,
 *   projectId: ctx.session.projectId,
 *   objectType: "TRACE",
 * });
 *
 * if (hasNoMatches) {
 *   return { traces: [] };
 * }
 *
 * // Use filterState directly in query
 */
export async function applyCommentFilters({
  filterState,
  prisma,
  projectId,
  objectType,
  idColumn = "id",
}: {
  filterState: z.infer<typeof singleFilter>[];
  prisma: PrismaClient;
  projectId: string;
  objectType: CommentObjectType;
  idColumn?: string;
}): Promise<{
  filterState: z.infer<typeof singleFilter>[];
  hasNoMatches: boolean;
  matchingIds: string[] | null;
}> {
  try {
    return await applyCommentFiltersToFilterState({
      filterState,
      prisma,
      projectId,
      objectType,
      idColumn,
    });
  } catch (error) {
    // Convert CommentFilterThresholdExceededError to TRPCError for web
    if (error instanceof CommentFilterThresholdExceededError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
      });
    }
    throw error;
  }
}
