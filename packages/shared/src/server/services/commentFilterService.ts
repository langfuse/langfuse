import type { PrismaClient } from "../../db";
import { type singleFilter } from "../../interfaces/filters";
import {
  type CommentObjectType,
  type CommentCountOperator,
  type CommentContentOperator,
  getObjectIdsByCommentCount,
  getObjectIdsByCommentContent,
} from "../repositories/comments";
import type { z } from "zod/v4";

/**
 * Maximum number of object IDs that can be returned from comment filters.
 * This protects ClickHouse from processing excessively large IN clauses.
 * Typical scenarios: 10K comments → 1K-5K distinct object IDs (well under limit)
 */
export const COMMENT_FILTER_THRESHOLD = 50000;

/**
 * Validates that the number of object IDs is within acceptable limits.
 * Throws a user-friendly error if threshold is exceeded.
 */
export function validateObjectIdCount(
  objectIds: string[],
  objectType: CommentObjectType,
): void {
  if (objectIds.length > COMMENT_FILTER_THRESHOLD) {
    const objectTypePlural = objectType.toLowerCase() + "s";
    throw new Error(
      `Comment filter matches ${objectIds.length.toLocaleString()} ${objectTypePlural} (limit: ${COMMENT_FILTER_THRESHOLD.toLocaleString()}). Please add additional filters to narrow your search.`,
    );
  }
}

/**
 * Checks if the comment count filters include items with zero comments.
 * This is true when:
 * - There's no lower bound filter (defaults to >= 0)
 * - The lower bound allows 0 (>= 0, >= negative, or > negative)
 *
 * When true, we need to use exclusion logic instead of inclusion logic,
 * since items with 0 comments don't exist in the comments table.
 */
function filterRangeIncludesZero(
  filters: Array<{ type: string; operator: string; value: number }>,
): boolean {
  const lowerBoundFilters = filters.filter(
    (f) => f.type === "number" && (f.operator === ">=" || f.operator === ">"),
  );

  // No lower bound = includes 0
  if (lowerBoundFilters.length === 0) {
    return true;
  }

  // Check if any lower bound allows 0
  return lowerBoundFilters.some(
    (f) =>
      (f.operator === ">=" && f.value <= 0) ||
      (f.operator === ">" && f.value < 0),
  );
}

/**
 * Processes comment filters from filter state and returns the updated filter state
 * with matching object IDs injected. This abstracts the duplicated logic across
 * all endpoints (traces, sessions, observations).
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
  // Extract comment filters from filterState
  const commentCountFilters = filterState.filter(
    (f) =>
      (f.type === "number" || f.type === "datetime") &&
      f.column === "commentCount",
  );
  const commentContentFilter = filterState.find(
    (f) => f.type === "string" && f.column === "commentContent",
  );

  // If no comment filters, return original filter state
  if (commentCountFilters.length === 0 && !commentContentFilter) {
    return {
      filterState,
      hasNoMatches: false,
      matchingIds: null,
    };
  }

  let objectIdsFromComments: string[] = [];
  const hasCommentCountFilters = commentCountFilters.length > 0;

  // Remove comment filters from filterState
  const updatedFilterState = filterState.filter(
    (f) =>
      !(
        ((f.type === "number" || f.type === "datetime") &&
          f.column === "commentCount") ||
        (f.type === "string" && f.column === "commentContent")
      ),
  );

  // Handle comment count filters (may be multiple for ranges like >= 1 AND <= 100)
  if (commentCountFilters.length > 0) {
    // Check if the filter range includes zero-comment items
    // e.g., >= 0, <= 100, or >= 0 AND <= 100 all include items with 0 comments
    const numberFilters = commentCountFilters
      .filter((f) => f.type === "number")
      .map((f) => ({
        type: f.type,
        operator: f.operator,
        value: (f as { value: number }).value,
      }));

    if (filterRangeIncludesZero(numberFilters)) {
      // When range includes zero, use EXCLUSION logic instead of inclusion
      // Find the upper bound filter (if any)
      const upperBoundFilter = numberFilters.find(
        (f) => f.operator === "<=" || f.operator === "<",
      );

      if (!upperBoundFilter) {
        // No upper bound + includes zero = match everything, skip comment count filter
        // But still process content filter if present
        if (!commentContentFilter) {
          return {
            filterState: updatedFilterState,
            hasNoMatches: false,
            matchingIds: null,
          };
        }
        // Continue to content filter handling below
      } else {
        // Get IDs that EXCEED the upper bound (to exclude them)
        const excludeOperator = upperBoundFilter.operator === "<=" ? ">" : ">=";
        const idsToExclude = await getObjectIdsByCommentCount({
          prisma,
          projectId,
          objectType,
          operator: excludeOperator as CommentCountOperator,
          value: upperBoundFilter.value,
        });

        validateObjectIdCount(idsToExclude, objectType);

        // Handle content filter intersection if present
        if (commentContentFilter && commentContentFilter.type === "string") {
          const contentObjectIds = await getObjectIdsByCommentContent({
            prisma,
            projectId,
            objectType,
            searchQuery: commentContentFilter.value,
            operator: commentContentFilter.operator as CommentContentOperator,
          });

          validateObjectIdCount(contentObjectIds, objectType);

          // For content filter with zero-inclusive count filter:
          // Include items matching content AND not exceeding upper bound
          // This is complex - items with matching content that have 0 comments
          // won't be in contentObjectIds (they have no comments to search)
          // So we can only return items that HAVE comments matching content
          // and also don't exceed the upper bound
          const matchingIds = contentObjectIds.filter(
            (id) => !idsToExclude.includes(id),
          );

          if (matchingIds.length === 0) {
            return {
              filterState: updatedFilterState,
              hasNoMatches: true,
              matchingIds: [],
            };
          }

          return {
            filterState: [
              ...updatedFilterState,
              {
                type: "stringOptions" as const,
                operator: "any of" as const,
                column: idColumn,
                value: matchingIds,
              },
            ],
            hasNoMatches: false,
            matchingIds,
          };
        }

        // No content filter - just exclude items exceeding upper bound
        if (idsToExclude.length > 0) {
          return {
            filterState: [
              ...updatedFilterState,
              {
                type: "stringOptions" as const,
                operator: "none of" as const,
                column: idColumn,
                value: idsToExclude,
              },
            ],
            hasNoMatches: false,
            matchingIds: null,
          };
        }

        // No items exceed limit, return all (no filter needed)
        return {
          filterState: updatedFilterState,
          hasNoMatches: false,
          matchingIds: null,
        };
      }
    } else {
      // Standard inclusion logic for filters that don't include zero
      // (e.g., >= 1, > 0, = 5, etc.)
      let isFirstCommentCountFilter = true;
      for (const commentCountFilter of commentCountFilters) {
        if (commentCountFilter.type === "number") {
          const filterObjectIds = await getObjectIdsByCommentCount({
            prisma,
            projectId,
            objectType,
            operator: commentCountFilter.operator as CommentCountOperator,
            value: commentCountFilter.value,
          });

          validateObjectIdCount(filterObjectIds, objectType);

          // Intersect with previous results (AND logic for multiple filters)
          if (isFirstCommentCountFilter) {
            objectIdsFromComments = filterObjectIds;
            isFirstCommentCountFilter = false;
          } else {
            objectIdsFromComments = objectIdsFromComments.filter((id) =>
              filterObjectIds.includes(id),
            );
          }
        }
      }
    }
  }

  // Handle comment content filter
  if (commentContentFilter && commentContentFilter.type === "string") {
    const contentObjectIds = await getObjectIdsByCommentContent({
      prisma,
      projectId,
      objectType,
      searchQuery: commentContentFilter.value,
      operator: commentContentFilter.operator as CommentContentOperator,
    });

    validateObjectIdCount(contentObjectIds, objectType);

    // Intersect with comment count results if present
    if (hasCommentCountFilters) {
      // Always intersect if comment count filters were processed
      objectIdsFromComments = objectIdsFromComments.filter((id) =>
        contentObjectIds.includes(id),
      );
    } else {
      objectIdsFromComments = contentObjectIds;
    }
  }

  // If no objects match, signal caller to return empty result
  if (objectIdsFromComments.length === 0) {
    return {
      filterState: updatedFilterState,
      hasNoMatches: true,
      matchingIds: [],
    };
  }

  // Inject matching object IDs as filter
  return {
    filterState: [
      ...updatedFilterState,
      {
        type: "stringOptions" as const,
        operator: "any of" as const,
        column: idColumn,
        value: objectIdsFromComments,
      },
    ],
    hasNoMatches: false,
    matchingIds: objectIdsFromComments,
  };
}
