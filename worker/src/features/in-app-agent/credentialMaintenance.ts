import { prisma } from "@langfuse/shared/src/db";
import { logger, recordIncrement, redis } from "@langfuse/shared/src/server";
import { deleteApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";

const METRIC_PREFIX = "langfuse.in_app_agent_lifecycle";

const BATCH_SIZE = 100;

/**
 * Comfortably beyond RUN_MAX_DURATION (15 min) plus the heartbeat fencing
 * latency, so this can never revoke a credential a live run is still using.
 */
const ORPHAN_CREDENTIAL_AGE_MS = 30 * 60_000;

/**
 * Revoke the ephemeral MCP credentials that background runs mint per run.
 *
 * Two batches on purpose. The first bounds a *known* leak: a terminal run whose
 * delete failed still points at its key, and retrying immediately keeps the
 * credential's lifetime at a minute rather than the orphan sweep's 30. The
 * second is the backstop for keys no run points at any more, including keys
 * whose run row was cascade-deleted with its project.
 */
export async function runInAppAgentCredentialMaintenance(): Promise<void> {
  await retryTerminalRunCredentials();
  await revokeOrphanedCredentials();
}

async function retryTerminalRunCredentials(): Promise<void> {
  const runs = await prisma.inAppAgentRun.findMany({
    where: { finishedAt: { not: null }, mcpApiKeyId: { not: null } },
    orderBy: { finishedAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, projectId: true, mcpApiKeyId: true },
  });

  for (const run of runs) {
    if (!run.mcpApiKeyId) continue;

    try {
      const revoked = await revokeCredential({
        apiKeyId: run.mcpApiKeyId,
        projectId: run.projectId,
      });

      if (!revoked) {
        continue;
      }

      // Only now: while the key may still exist, the pointer is the only way
      // back to it.
      await prisma.inAppAgentRun.updateMany({
        where: { id: run.id, projectId: run.projectId },
        data: { mcpApiKeyId: null },
      });

      recordIncrement(`${METRIC_PREFIX}.action`, 1, {
        action: "terminal_credential",
        outcome: "applied",
      });
    } catch (error) {
      recordIncrement(`${METRIC_PREFIX}.action`, 1, {
        action: "terminal_credential",
        outcome: "failed",
      });
      logger.error(
        "Failed to revoke in-app agent credential for terminal run",
        {
          error,
          projectId: run.projectId,
          runId: run.id,
        },
      );
    }
  }
}

async function revokeOrphanedCredentials(): Promise<void> {
  const keys = await prisma.apiKey.findMany({
    where: {
      isInAppAgentKey: true,
      scope: "PROJECT",
      projectId: { not: null },
      createdAt: { lt: new Date(Date.now() - ORPHAN_CREDENTIAL_AGE_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, projectId: true },
  });

  if (keys.length === 0) {
    return;
  }

  // One lookup for the whole batch: a key still pointed at by an unfinished run
  // belongs to a run that outlived the age threshold, not to an orphan.
  const referenced = await prisma.inAppAgentRun.findMany({
    where: {
      finishedAt: null,
      mcpApiKeyId: { in: keys.map((key) => key.id) },
    },
    select: { mcpApiKeyId: true },
  });
  const referencedKeyIds = new Set(
    referenced.flatMap((run) => (run.mcpApiKeyId ? [run.mcpApiKeyId] : [])),
  );

  for (const key of keys) {
    if (!key.projectId || referencedKeyIds.has(key.id)) {
      continue;
    }

    try {
      const revoked = await revokeCredential({
        apiKeyId: key.id,
        projectId: key.projectId,
      });

      if (!revoked) {
        continue;
      }

      await prisma.inAppAgentRun.updateMany({
        where: { mcpApiKeyId: key.id },
        data: { mcpApiKeyId: null },
      });

      recordIncrement(`${METRIC_PREFIX}.action`, 1, {
        action: "orphan_credential",
        outcome: "applied",
      });
    } catch (error) {
      recordIncrement(`${METRIC_PREFIX}.action`, 1, {
        action: "orphan_credential",
        outcome: "failed",
      });
      logger.error("Failed to revoke orphaned in-app agent credential", {
        error,
        projectId: key.projectId,
        apiKeyId: key.id,
      });
    }
  }
}

/**
 * Returns whether the credential is confirmed gone. An already-absent key is a
 * success: the delete that failed last time evidently landed, and the caller
 * should finish the cleanup by clearing its pointer.
 */
async function revokeCredential(params: {
  apiKeyId: string;
  projectId: string;
}): Promise<boolean> {
  const existing = await prisma.apiKey.findUnique({
    where: { id: params.apiKeyId },
    select: { id: true },
  });

  if (!existing) {
    return true;
  }

  await deleteApiKeyFromDb({
    prisma,
    id: params.apiKeyId,
    entityId: params.projectId,
    scope: "PROJECT",
    redis,
  });

  return true;
}
