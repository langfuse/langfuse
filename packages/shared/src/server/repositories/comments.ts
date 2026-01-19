import type { PrismaClient } from "../../db";
import { Prisma } from "../../db";
import { filterOperators } from "../../interfaces/filters";

/**
 * Supported object types for comment filtering
 */
export type CommentObjectType = "TRACE" | "OBSERVATION" | "SESSION" | "PROMPT";

/**
 * Operators for comment count filters.
 * Extends filterOperators.number with "!=" for additional filtering capability.
 */
export type CommentCountOperator =
  | (typeof filterOperators.number)[number]
  | "!=";

/**
 * Operators for comment content filters.
 * Uses the same operators as filterOperators.string.
 */
export type CommentContentOperator = (typeof filterOperators.string)[number];

/**
 * Query PostgreSQL for object IDs that have a specific number of comments.
 * Uses GROUP BY + HAVING to efficiently filter by comment count.
 *
 * @example
 * // Get traces with >= 3 comments
 * await getObjectIdsByCommentCount({
 *   prisma,
 *   projectId: "abc123",
 *   objectType: "TRACE",
 *   operator: ">=",
 *   value: 3
 * });
 */
export async function getObjectIdsByCommentCount({
  prisma,
  projectId,
  objectType,
  operator,
  value,
}: {
  prisma: PrismaClient;
  projectId: string;
  objectType: CommentObjectType;
  operator: CommentCountOperator;
  value: number;
}): Promise<string[]> {
  // Validate operator to prevent SQL injection
  const validOperators: CommentCountOperator[] = [
    ">=",
    "<=",
    "=",
    ">",
    "<",
    "!=",
  ];
  if (!validOperators.includes(operator)) {
    throw new Error(`Invalid operator: ${operator}`);
  }

  const rawQuery = Prisma.sql`
    SELECT object_id
    FROM comments
    WHERE project_id = ${projectId} AND object_type = ${objectType}::"CommentObjectType"
    GROUP BY object_id
    HAVING COUNT(*) ${Prisma.raw(operator)} ${value}
  `;

  const results = await prisma.$queryRaw<{ object_id: string }[]>(rawQuery);
  return results.map((r) => r.object_id);
}

/**
 * Query PostgreSQL for object IDs where comments match a text search query.
 * Uses PostgreSQL's full-text search with GIN index for "contains" operator.
 * Falls back to ILIKE for other operators.
 *
 * @example
 * // Get traces with comments containing "bug"
 * await getObjectIdsByCommentContent({
 *   prisma,
 *   projectId: "abc123",
 *   objectType: "TRACE",
 *   searchQuery: "bug",
 *   operator: "contains"
 * });
 */
export async function getObjectIdsByCommentContent({
  prisma,
  projectId,
  objectType,
  searchQuery,
  operator = "contains",
}: {
  prisma: PrismaClient;
  projectId: string;
  objectType: CommentObjectType;
  searchQuery: string;
  operator?: CommentContentOperator;
}): Promise<string[]> {
  if (operator === "contains") {
    // Use full-text search with GIN index for best performance
    // plainto_tsquery() automatically sanitizes special characters and handles tokenization
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      return [];
    }

    const rawResults = await prisma.$queryRaw<{ object_id: string }[]>`
      SELECT DISTINCT object_id
      FROM comments
      WHERE project_id = ${projectId}
        AND object_type = ${objectType}::"CommentObjectType"
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ${trimmedQuery})
    `;

    return rawResults.map((r) => r.object_id);
  }

  // For other operators, use Prisma's query builder with ILIKE
  let whereCondition: Prisma.CommentWhereInput;

  if (operator === "does not contain") {
    whereCondition = {
      projectId,
      objectType,
      NOT: {
        content: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
    };
  } else if (operator === "starts with") {
    whereCondition = {
      projectId,
      objectType,
      content: {
        startsWith: searchQuery,
        mode: "insensitive",
      },
    };
  } else if (operator === "ends with") {
    whereCondition = {
      projectId,
      objectType,
      content: {
        endsWith: searchQuery,
        mode: "insensitive",
      },
    };
  } else {
    // Default to contains (for "=" operator which maps to exact match in string filters)
    whereCondition = {
      projectId,
      objectType,
      content: {
        contains: searchQuery,
        mode: "insensitive",
      },
    };
  }

  const comments = await prisma.comment.findMany({
    where: whereCondition,
    select: { objectId: true },
    distinct: ["objectId"],
  });

  return comments.map((c) => c.objectId);
}

/**
 * Maximum number of object IDs that can be returned from comment filters.
 * This protects ClickHouse from processing excessively large IN clauses.
 * Typical scenarios: 10K comments → 1K-5K distinct object IDs (well under limit)
 */
export const COMMENT_FILTER_THRESHOLD = 50000;

/**
 * Error thrown when comment filter threshold is exceeded.
 * This allows callers to catch and handle this specific error type.
 */
export class CommentFilterThresholdExceededError extends Error {
  constructor(
    public readonly objectIds: number,
    public readonly objectType: CommentObjectType,
    public readonly threshold: number,
  ) {
    const objectTypePlural = objectType.toLowerCase() + "s";
    super(
      `Comment filter matches ${objectIds.toLocaleString()} ${objectTypePlural} (limit: ${threshold.toLocaleString()}). Please add additional filters to narrow your search.`,
    );
    this.name = "CommentFilterThresholdExceededError";
  }
}

/**
 * Validates that the number of object IDs is within acceptable limits.
 * Throws a CommentFilterThresholdExceededError if threshold is exceeded.
 */
export function validateCommentFilterObjectIdCount(
  objectIds: string[],
  objectType: CommentObjectType,
): void {
  if (objectIds.length > COMMENT_FILTER_THRESHOLD) {
    throw new CommentFilterThresholdExceededError(
      objectIds.length,
      objectType,
      COMMENT_FILTER_THRESHOLD,
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
 * Result type for comment filter processing
 */
export type CommentFilterResult<T> = {
  /** Updated filter state with comment filters replaced by object ID filter */
  filterState: T[];
  /** true if comment filters were present but matched nothing (caller should return empty result) */
  hasNoMatches: boolean;
  /** The object IDs matching comment filters (null if no comment filters) */
  matchingIds: string[] | null;
};

/**
 * Generic single filter type for use with applyCommentFiltersToFilterState.
 * This matches the shape of filters used in the codebase.
 */
export type CommentFilterInput = {
  type: string;
  column: string;
  operator: string;
  value: unknown;
};

/**
 * Processes comment filters from filter state and returns the updated filter state
 * with matching object IDs injected. This is a shared implementation that can be used
 * by both tRPC endpoints (web) and the batch export worker.
 *
 * @returns Object with:
 *   - filterState: Updated filter state with comment filters replaced by object ID filter
 *   - hasNoMatches: true if comment filters were present but matched nothing (caller should return empty result)
 *   - matchingIds: The object IDs matching comment filters (null if no comment filters). Useful for
 *                  cases that need to intersect with another ID list (e.g., metrics endpoint).
 *
 * @example
 * const { filterState, hasNoMatches } = await applyCommentFiltersToFilterState({
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
export async function applyCommentFiltersToFilterState<
  T extends CommentFilterInput,
>({
  filterState,
  prisma,
  projectId,
  objectType,
  idColumn = "id",
}: {
  filterState: T[];
  prisma: PrismaClient;
  projectId: string;
  objectType: CommentObjectType;
  idColumn?: string;
}): Promise<CommentFilterResult<T>> {
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
        value: f.value as number,
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

        validateCommentFilterObjectIdCount(idsToExclude, objectType);

        // Handle content filter intersection if present
        if (commentContentFilter && commentContentFilter.type === "string") {
          const contentObjectIds = await getObjectIdsByCommentContent({
            prisma,
            projectId,
            objectType,
            searchQuery: commentContentFilter.value as string,
            operator: commentContentFilter.operator as CommentContentOperator,
          });

          validateCommentFilterObjectIdCount(contentObjectIds, objectType);

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
                type: "stringOptions",
                operator: "any of",
                column: idColumn,
                value: matchingIds,
              } as T,
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
                type: "stringOptions",
                operator: "none of",
                column: idColumn,
                value: idsToExclude,
              } as T,
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
            value: commentCountFilter.value as number,
          });

          validateCommentFilterObjectIdCount(filterObjectIds, objectType);

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
      searchQuery: commentContentFilter.value as string,
      operator: commentContentFilter.operator as CommentContentOperator,
    });

    validateCommentFilterObjectIdCount(contentObjectIds, objectType);

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
        type: "stringOptions",
        operator: "any of",
        column: idColumn,
        value: objectIdsFromComments,
      } as T,
    ],
    hasNoMatches: false,
    matchingIds: objectIdsFromComments,
  };
}
