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
