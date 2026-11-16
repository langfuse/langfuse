import { randomUUID } from "node:crypto";
import { type Prisma } from "@langfuse/shared/src/db";

export async function lockSessionViewPins(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
) {
  // The Messages row serializes pin writes for a user/project. Keep its
  // existing state, including explicit unpins, when acquiring the lock.
  await tx.$executeRaw`
    INSERT INTO session_view_pin_overrides AS pin_override
      (id, project_id, user_id, view_id, is_pinned, position)
    VALUES (${randomUUID()}, ${projectId}, ${userId}, NULL, true, -1)
    ON CONFLICT (project_id, user_id) WHERE view_id IS NULL
    DO UPDATE SET is_pinned = pin_override.is_pinned
  `;
}
