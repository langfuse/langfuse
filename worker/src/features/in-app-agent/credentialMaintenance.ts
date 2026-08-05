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
 * Backstop for the ephemeral MCP credentials that background runs mint per run.
 *
 * The two paths that normally revoke a credential are the worker's own
 * `onFinish` and, when that worker died, `revokeRunCredential` from the
 * lifecycle sweep at the moment it terminalizes the run. This job only catches
 * what both missed: a run terminalized by the read path, or a key whose run row
 * was cascade-deleted with its project.
 *
 * Deliberately hourly. Neither query can use an index — `finished_at IS NOT
 * NULL` is the complement of the partial active-run index, and `api_keys` has
 * none on `is_in_app_agent_key` — so each pass is a sequential scan, and
 * `in_app_agent_runs` grows forever. Running it every minute would buy nothing:
 * the credential a run leaks is already revoked within a sweep tick, and the
 * secret never leaves the worker process that minted it, so what is left here
 * is hygiene rather than exposure.
 */
export async function runInAppAgentCredentialMaintenance(): Promise<void> {
  await retryTerminalRunCredentials();
  await revokeOrphanedCredentials();
}

/**
 * Revoke one run's credential and clear its pointer. Used by the lifecycle
 * sweep the instant it terminalizes a run, which is the case that matters: a
 * worker killed mid-run never got to revoke its own key, and nothing else
 * knows the key exists except that pointer.
 */
export async function revokeRunCredential(params: {
  runId: string;
  projectId: string;
  mcpApiKeyId: string;
}): Promise<void> {
  await revokeCredential({
    apiKeyId: params.mcpApiKeyId,
    projectId: params.projectId,
  });

  await prisma.inAppAgentRun.updateMany({
    where: { id: params.runId, projectId: params.projectId },
    data: { mcpApiKeyId: null },
  });
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
