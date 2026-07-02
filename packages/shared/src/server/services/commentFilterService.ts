import type { PrismaClient } from "../../db";
import {
  normalizeFilterExpressionInput,
  type singleFilter,
} from "../../interfaces/filters";
import { type FilterExpression, type FilterInput } from "../../types";
import {
  type CommentObjectType,
  type CommentCountOperator,
  type CommentContentOperator,
  getObjectIdsByCommentCount,
  getObjectIdsByCommentContent,
} from "../repositories/comments";
import type { z } from "zod";

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
 *
 * The count filters AND together, so zero is in the matched range iff a count of
 * 0 satisfies EVERY condition. This must cover every operator, not just lower
 * bounds: `commentCount = 5` excludes zero (so we narrow), while `< 5` / `<= 0`
 * include it. Treating an `=`/`<`/`<=` filter as "no lower bound = includes 0"
 * was the bug behind `OR(commentCount=N, …)` collapsing to match-everything.
 *
 * When true, we use exclusion logic instead of inclusion logic, since items with
 * 0 comments don't exist in the comments table.
 */
export function filterRangeIncludesZero(
  filters: Array<{ type: string; operator: string; value: number }>,
): boolean {
  return filters
    .filter((f) => f.type === "number")
    .every((f) => {
      switch (f.operator) {
        case ">=":
          return 0 >= f.value;
        case ">":
          return 0 > f.value;
        case "<=":
          return 0 <= f.value;
        case "<":
          return 0 < f.value;
        case "=":
          return f.value === 0;
        // Unknown operator: don't assume zero is in range — fall back to
        // inclusion logic (narrow) rather than match-everything.
        default:
          return false;
      }
    });
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
    // commentCount is always a number column; the inner loop only handles
    // `number`, so match number-only (a datetime variant can't reach the wire).
    (f) => f.type === "number" && f.column === "commentCount",
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
        (f.type === "number" && f.column === "commentCount") ||
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

type CommentFilterRewriteResult = {
  expression?: FilterExpression;
  hasNoMatches: boolean;
  matchingIds: string[] | null;
};

function isCommentFilter(filter: z.infer<typeof singleFilter>): boolean {
  return (
    (filter.type === "number" && filter.column === "commentCount") ||
    (filter.type === "string" && filter.column === "commentContent")
  );
}

/**
 * Resolve comment pseudo-filters (`commentCount`/`commentContent`) anywhere in a
 * nested {@link FilterExpression}. Each comment leaf is resolved to a set of
 * matching object IDs via Postgres and rewritten to an `id any of [...]`
 * condition; the surrounding tree structure (AND/OR groups) is preserved.
 *
 * Semantics of an empty match within a group:
 * - inside AND: the whole group has no matches (AND with an impossible term);
 * - inside OR: that branch drops, the rest of the OR still applies.
 */
async function rewriteCommentFiltersInExpression({
  filterExpression,
  prisma,
  projectId,
  objectType,
  idColumn,
}: {
  filterExpression?: FilterExpression;
  prisma: PrismaClient;
  projectId: string;
  objectType: CommentObjectType;
  idColumn: string;
}): Promise<CommentFilterRewriteResult> {
  if (!filterExpression) {
    return {
      expression: undefined,
      hasNoMatches: false,
      matchingIds: null,
    };
  }

  if (filterExpression.type !== "group") {
    if (!isCommentFilter(filterExpression)) {
      return {
        expression: filterExpression,
        hasNoMatches: false,
        matchingIds: null,
      };
    }

    const result = await applyCommentFilters({
      filterState: [filterExpression],
      prisma,
      projectId,
      objectType,
      idColumn,
    });

    return {
      expression: normalizeFilterExpressionInput(result.filterState),
      hasNoMatches: result.hasNoMatches,
      matchingIds: result.matchingIds,
    };
  }

  const rewrittenChildren = await Promise.all(
    filterExpression.conditions.map((condition) =>
      rewriteCommentFiltersInExpression({
        filterExpression: condition,
        prisma,
        projectId,
        objectType,
        idColumn,
      }),
    ),
  );

  if (filterExpression.operator === "AND") {
    if (rewrittenChildren.some((child) => child.hasNoMatches)) {
      return {
        expression: undefined,
        hasNoMatches: true,
        matchingIds: [],
      };
    }

    const expressions = rewrittenChildren.flatMap((child) =>
      child.expression ? [child.expression] : [],
    );

    if (expressions.length === 0) {
      return {
        expression: undefined,
        hasNoMatches: false,
        matchingIds: null,
      };
    }

    if (expressions.length === 1) {
      return {
        expression: expressions[0],
        hasNoMatches: false,
        matchingIds: null,
      };
    }

    return {
      expression: {
        type: "group",
        operator: "AND",
        conditions: expressions,
      },
      hasNoMatches: false,
      matchingIds: null,
    };
  }

  // OR group: a non-comment child with no expression would match everything, so
  // the whole OR matches everything — drop the comment-derived narrowing.
  if (
    rewrittenChildren.some((child) => !child.hasNoMatches && !child.expression)
  ) {
    return {
      expression: undefined,
      hasNoMatches: false,
      matchingIds: null,
    };
  }

  const expressions = rewrittenChildren.flatMap((child) =>
    !child.hasNoMatches && child.expression ? [child.expression] : [],
  );

  if (expressions.length === 0) {
    return {
      expression: undefined,
      hasNoMatches: true,
      matchingIds: [],
    };
  }

  if (expressions.length === 1) {
    return {
      expression: expressions[0],
      hasNoMatches: false,
      matchingIds: null,
    };
  }

  return {
    expression: {
      type: "group",
      operator: "OR",
      conditions: expressions,
    },
    hasNoMatches: false,
    matchingIds: null,
  };
}

/**
 * {@link applyCommentFilters} for the nested filter contract. Accepts a flat
 * {@link FilterInput} array or a nested expression, resolves comment filters
 * recursively, and returns the rewritten {@link FilterExpression}.
 */
export async function applyCommentFiltersToFilterInput({
  filterState,
  prisma,
  projectId,
  objectType,
  idColumn = "id",
}: {
  filterState: FilterInput | undefined;
  prisma: PrismaClient;
  projectId: string;
  objectType: CommentObjectType;
  idColumn?: string;
}): Promise<{
  filterState: FilterExpression | undefined;
  hasNoMatches: boolean;
}> {
  // matchingIds is intentionally not surfaced: a nested rewrite resolves comment
  // filters into `id any of [...]` leaves anywhere in the tree, so there is no
  // single matching-id set to return (the flat applyCommentFilters keeps it for
  // its own intersection step; this tree variant has no such consumer).
  const result = await rewriteCommentFiltersInExpression({
    filterExpression: normalizeFilterExpressionInput(filterState),
    prisma,
    projectId,
    objectType,
    idColumn,
  });

  return {
    filterState: result.expression,
    hasNoMatches: result.hasNoMatches,
  };
}
