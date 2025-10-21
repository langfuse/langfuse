import { prisma } from "@langfuse/shared/src/db";
import { type CommentObjectType } from "@prisma/client";

export type ExportComment = {
  id: string;
  content: string;
  author_user_id: string | null;
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

  const comments = await prisma.comment.findMany({
    where: {
      projectId,
      objectType,
      objectId: { in: objectIds },
    },
    select: {
      id: true,
      objectId: true,
      content: true,
      authorUserId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" }, // Chronological order
  });

  // Group by objectId
  const commentsByObject = new Map<string, ExportComment[]>();

  for (const comment of comments) {
    if (!commentsByObject.has(comment.objectId)) {
      commentsByObject.set(comment.objectId, []);
    }

    commentsByObject.get(comment.objectId)!.push({
      id: comment.id,
      content: comment.content,
      author_user_id: comment.authorUserId,
      created_at: comment.createdAt.toISOString(),
    });
  }

  return commentsByObject;
}
