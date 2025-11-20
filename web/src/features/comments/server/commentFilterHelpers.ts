import {
  Prisma,
  type PrismaClient,
  type singleFilter,
} from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";

/**
 * Maximum number of trace IDs that can be returned from comment filters.
 * This protects ClickHouse from processing excessively large IN clauses.
 * Typical scenarios: 10K comments → 1K-5K distinct trace IDs (well under limit)
 */
export const COMMENT_FILTER_THRESHOLD = 50000;

/**
 * Supported operators for comment count filters
 */
export type CommentCountOperator = ">=" | "<=" | "=" | ">" | "<" | "!=";

/**
 * Supported operators for comment content filters
 */
export type CommentContentOperator =
  | "contains"
  | "does not contain"
  | "starts with"
  | "ends with";

/**
 * Validates that the number of trace IDs is within acceptable limits.
 * Throws a user-friendly error if threshold is exceeded.
 */
export function validateTraceIdCount(traceIds: string[]): void {
  if (traceIds.length > COMMENT_FILTER_THRESHOLD) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Comment filter matches ${traceIds.length.toLocaleString()} traces (limit: ${COMMENT_FILTER_THRESHOLD.toLocaleString()}). Please add additional filters to narrow your search.`,
    });
  }
}

/**
 * Query PostgreSQL for trace IDs that have a specific number of comments.
 * Uses GROUP BY + HAVING to efficiently filter by comment count.
 *
 * @example
 * // Get traces with >= 3 comments
 * await getTraceIdsByCommentCount({
 *   prisma,
 *   projectId: "abc123",
 *   operator: ">=",
 *   value: 3
 * });
 */
export async function getTraceIdsByCommentCount({
  prisma,
  projectId,
  operator,
  value,
}: {
  prisma: PrismaClient;
  projectId: string;
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
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid operator: ${operator}`,
    });
  }

  const rawQuery = Prisma.sql`
    SELECT object_id
    FROM comments
    WHERE project_id = ${projectId} AND object_type = 'TRACE'
    GROUP BY object_id
    HAVING COUNT(*) ${Prisma.raw(operator)} ${value}
  `;

  const results = await prisma.$queryRaw<{ object_id: string }[]>(rawQuery);
  return results.map((r) => r.object_id);
}

/**
 * Query PostgreSQL for trace IDs where comments match a text search query.
 * Uses PostgreSQL's full-text search with GIN index for "contains" operator.
 * Falls back to ILIKE for other operators.
 *
 * @example
 * // Get traces with comments containing "bug"
 * await getTraceIdsByCommentContent({
 *   prisma,
 *   projectId: "abc123",
 *   searchQuery: "bug",
 *   operator: "contains"
 * });
 */
export async function getTraceIdsByCommentContent({
  prisma,
  projectId,
  searchQuery,
  operator = "contains",
}: {
  prisma: PrismaClient;
  projectId: string;
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
        AND object_type = 'TRACE'
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ${trimmedQuery})
    `;

    return rawResults.map((r) => r.object_id);
  }

  // For other operators, use Prisma's query builder with ILIKE
  let whereCondition: Prisma.CommentWhereInput;

  if (operator === "does not contain") {
    whereCondition = {
      projectId,
      objectType: "TRACE",
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
      objectType: "TRACE",
      content: {
        startsWith: searchQuery,
        mode: "insensitive",
      },
    };
  } else if (operator === "ends with") {
    whereCondition = {
      projectId,
      objectType: "TRACE",
      content: {
        endsWith: searchQuery,
        mode: "insensitive",
      },
    };
  } else {
    // Default to contains
    whereCondition = {
      projectId,
      objectType: "TRACE",
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
 * Processes comment filters from filter state and returns matching trace IDs.
 * Extracts comment filters, queries PostgreSQL, and removes them from filter state.
 * This consolidates the duplicated logic across traces.all, traces.countAll, and traces.metrics.
 *
 * @returns Object with:
 *   - updatedFilterState: Filter state with comment filters removed
 *   - matchingTraceIds: null if no comment filters, [] if no matches, or array of matching trace IDs
 *
 * @example
 * const { updatedFilterState, matchingTraceIds } = await processCommentFilters({
 *   filterState: input.filter,
 *   prisma,
 *   projectId: ctx.session.projectId
 * });
 *
 * if (matchingTraceIds !== null) {
 *   if (matchingTraceIds.length === 0) {
 *     return { traces: [] }; // No matches
 *   }
 *   // Use matchingTraceIds to filter ClickHouse query
 * }
 */
export async function processCommentFilters({
  filterState,
  prisma,
  projectId,
}: {
  filterState: singleFilter[];
  prisma: PrismaClient;
  projectId: string;
}): Promise<{
  updatedFilterState: singleFilter[];
  matchingTraceIds: string[] | null;
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

  // If no comment filters, return early
  if (commentCountFilters.length === 0 && !commentContentFilter) {
    return {
      updatedFilterState: filterState,
      matchingTraceIds: null,
    };
  }

  let traceIdsFromComments: string[] = [];
  const hasCommentCountFilters = commentCountFilters.length > 0;

  // Remove comment filters from filterState
  let updatedFilterState = filterState.filter(
    (f) =>
      !(
        ((f.type === "number" || f.type === "datetime") &&
          f.column === "commentCount") ||
        (f.type === "string" && f.column === "commentContent")
      ),
  );

  // Handle comment count filters (may be multiple for ranges like >= 1 AND <= 100)
  if (commentCountFilters.length > 0) {
    // Process each comment count filter and intersect results
    let isFirstCommentCountFilter = true;
    for (const commentCountFilter of commentCountFilters) {
      if (commentCountFilter.type === "number") {
        const filterTraceIds = await getTraceIdsByCommentCount({
          prisma,
          projectId,
          operator: commentCountFilter.operator as CommentCountOperator,
          value: commentCountFilter.value,
        });

        validateTraceIdCount(filterTraceIds);

        // Intersect with previous results (AND logic for multiple filters)
        if (isFirstCommentCountFilter) {
          traceIdsFromComments = filterTraceIds;
          isFirstCommentCountFilter = false;
        } else {
          traceIdsFromComments = traceIdsFromComments.filter((id) =>
            filterTraceIds.includes(id),
          );
        }
      }
    }
  }

  // Handle comment content filter
  if (commentContentFilter && commentContentFilter.type === "string") {
    const contentTraceIds = await getTraceIdsByCommentContent({
      prisma,
      projectId,
      searchQuery: commentContentFilter.value,
      operator: commentContentFilter.operator as CommentContentOperator,
    });

    validateTraceIdCount(contentTraceIds);

    // Intersect with comment count results if present
    if (hasCommentCountFilters) {
      // Always intersect if comment count filters were processed
      traceIdsFromComments = traceIdsFromComments.filter((id) =>
        contentTraceIds.includes(id),
      );
    } else {
      traceIdsFromComments = contentTraceIds;
    }
  }

  return {
    updatedFilterState,
    matchingTraceIds: traceIdsFromComments,
  };
}
