import { prisma } from "@langfuse/shared/src/db";
import {
  dispatchProjectNotification,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

export type AdminDisableBlobStorageResult =
  | { kind: "not-found" }
  | { kind: "already-disabled" }
  | {
      kind: "disabled";
      lastError: string;
      lastErrorAt: Date;
      notificationSent: boolean;
    };

/**
 * Turns off a project's blob storage export on behalf of a Langfuse
 * administrator. The reason is stored as lastError, which the settings page
 * shows, and sent to the project's notification channels and admin emails.
 */
export async function disableBlobStorageIntegrationByAdmin({
  projectId,
  reason,
}: {
  projectId: string;
  reason: string;
}): Promise<AdminDisableBlobStorageResult> {
  const lastErrorAt = new Date();
  // The enabled=true claim makes concurrent calls notify at most once.
  const { count } = await prisma.blobStorageIntegration.updateMany({
    where: { projectId, enabled: true },
    data: { enabled: false, lastError: reason, lastErrorAt },
  });

  if (count === 0) {
    const exists = await prisma.blobStorageIntegration.findUnique({
      where: { projectId },
      select: { projectId: true },
    });
    return exists ? { kind: "already-disabled" } : { kind: "not-found" };
  }

  logger.warn(
    `[BLOB INTEGRATION] Blob storage integration for project ${projectId} disabled by an administrator: ${reason}`,
    { projectId },
  );

  const notificationSent = await notifyAdminDisable({ projectId, reason });
  return { kind: "disabled", lastError: reason, lastErrorAt, notificationSent };
}

// The disable is already committed, so a notification failure is reported to
// the caller rather than thrown.
async function notifyAdminDisable({
  projectId,
  reason,
}: {
  projectId: string;
  reason: string;
}): Promise<boolean> {
  try {
    const [project, integration] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      }),
      prisma.blobStorageIntegration.findUnique({
        where: { projectId },
        select: { bucketName: true },
      }),
    ]);
    const projectName = project?.name ?? projectId;

    await dispatchProjectNotification({
      projectId,
      event: {
        eventType: "blob-export-failed",
        severity: "ALERT",
        projectId,
        projectName,
        resourceId: projectId,
        resourceName: integration?.bucketName ?? "Blob storage integration",
        message: `Blob storage export disabled for project "${projectName}" by an administrator: ${reason}`,
        url: env.NEXTAUTH_URL
          ? `${env.NEXTAUTH_URL}/project/${projectId}/settings/integrations/blobstorage`
          : undefined,
        disabled: true,
        reason,
      },
    });
    return true;
  } catch (error) {
    logger.error(
      `[BLOB INTEGRATION] Failed to notify project ${projectId} about an administrator disable`,
      error,
    );
    return false;
  }
}
