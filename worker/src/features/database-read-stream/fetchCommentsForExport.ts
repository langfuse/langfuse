import { prisma } from "@langfuse/shared/src/db";
import { type CommentObjectType } from "@prisma/client";

export type ExportComment = {
  id: string;
  content: string;
  author_email: string | null;
  created_at: string; // ISO format
};

/**
 * Fetches comments for a batch of objects during export operations.
 * Groups comments by objectId for efficient lookup.
 *
 * @param projectId - The project ID to filter comments
 * @param objectType - Type of object (TRACE, OBSERVATION, SESSION, etc.)
 * @param objectIds - Array of object IDs to fetch comments for
 * @returns Map of objectId to array of comments (chronological order)
 */
export async function fetchCommentsForExport(
  projectId: string,
  objectType: CommentObjectType,
  objectIds: string[],
): Promise<Map<string, ExportComment[]>> {
  if (objectIds.length === 0) {
    return new Map();
  }

  // Note: We need to queryRaw because authorUserId has no foreignKey constraint set
  const comments = await prisma.$queryRaw<
    Array<{
      id: string;
      object_id: string;
      content: string;
      author_user_id: string | null;
      author_email: string | null;
      created_at: Date;
    }>
  >`
    SELECT
      c.id,
      c.object_id,
      c.content,
      c.author_user_id,
      u.email as author_email,
      c.created_at
    FROM comments c
    LEFT JOIN users u ON c.author_user_id = u.id
    WHERE c.project_id = ${projectId}
      AND c.object_type = ${objectType}::"CommentObjectType"
      AND c.object_id = ANY(${objectIds}::text[])
    ORDER BY c.created_at ASC
  `;

  // Group by objectId
  const commentsByObject = new Map<string, ExportComment[]>();

  for (const comment of comments) {
    if (!commentsByObject.has(comment.object_id)) {
      commentsByObject.set(comment.object_id, []);
    }

    commentsByObject.get(comment.object_id)!.push({
      id: comment.id,
      content: comment.content,
      author_email: comment.author_email,
      created_at: comment.created_at.toISOString(),
    });
  }

  return commentsByObject;
}
