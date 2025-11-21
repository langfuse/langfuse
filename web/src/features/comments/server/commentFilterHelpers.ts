import type { PrismaClient } from "@langfuse/shared/src/db";
import { Prisma } from "@langfuse/shared/src/db";
import { type singleFilter } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import type { z } from "zod/v4";

/**
 * Maximum number of trace IDs that can be returned from comment filters.
 * This protects ClickHouse from processing excessively large IN clauses.
 * Typical scenarios: 10K comments → 1K-5K distinct trace IDs (well under limit)
 */
export const COMMENT_FILTER_THRESHOLD = 50000;

/**
 * Supported object types for comment filtering
 */
export type CommentObjectType = "TRACE" | "OBSERVATION" | "SESSION" | "PROMPT";

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
 * Validates that the number of object IDs is within acceptable limits.
 * Throws a user-friendly error if threshold is exceeded.
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
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid operator: ${operator}`,
    });
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
    // Default to contains
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
 * Processes comment filters from filter state and returns matching object IDs.
 * Extracts comment filters, queries PostgreSQL, and removes them from filter state.
 * This consolidates the duplicated logic across all endpoints (traces, sessions, prompts, observations).
 *
 * @returns Object with:
 *   - updatedFilterState: Filter state with comment filters removed
 *   - matchingObjectIds: null if no comment filters, [] if no matches, or array of matching object IDs
 *
 * @example
 * const { updatedFilterState, matchingObjectIds } = await processCommentFilters({
 *   filterState: input.filter,
 *   prisma,
 *   projectId: ctx.session.projectId,
 *   objectType: "TRACE"
 * });
 *
 * if (matchingObjectIds !== null) {
 *   if (matchingObjectIds.length === 0) {
 *     return { traces: [] }; // No matches
 *   }
 *   // Use matchingObjectIds to filter query
 * }
 */
export async function processCommentFilters({
  filterState,
  prisma,
  projectId,
  objectType,
}: {
  filterState: z.infer<typeof singleFilter>[];
  prisma: PrismaClient;
  projectId: string;
  objectType: CommentObjectType;
}): Promise<{
  updatedFilterState: z.infer<typeof singleFilter>[];
  matchingObjectIds: string[] | null;
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
      matchingObjectIds: null,
    };
  }

  let objectIdsFromComments: string[] = [];
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

  return {
    updatedFilterState,
    matchingObjectIds: objectIdsFromComments,
  };
}
