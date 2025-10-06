import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  invalidateCachedOrgApiKeys,
  traceException,
} from "@langfuse/shared/src/server";
import type { OrgUpdateData } from "./thresholdProcessing";

/**
 * Result of bulk update operation
 */
export type BulkUpdateResult = {
  successCount: number;
  failedCount: number;
  failedOrgIds: string[];
};

/**
 * Chunk size for bulk operations
 * 1000 orgs per transaction provides good balance between:
 * - Reducing round trips (vs individual updates)
 * - Not overwhelming single transaction (vs all at once)
 * - Memory usage (~100KB per chunk)
 */
const CHUNK_SIZE = 1000;

/**
 * Bulk update organizations in chunked transactions
 *
 * Current implementation uses Prisma transaction wrapper (Option 2).
 * Structure allows easy swap to raw SQL (Option 1) if needed.
 *
 * Error handling:
 * - Each chunk failure is isolated (won't kill entire job)
 * - Failed chunks reported to Datadog via traceException
 * - Successful chunks are committed
 *
 * @param updates - Array of org update data
 * @returns Summary of successful/failed updates
 */
export async function bulkUpdateOrganizations(
  updates: OrgUpdateData[],
): Promise<BulkUpdateResult> {
  if (updates.length === 0) {
    return { successCount: 0, failedCount: 0, failedOrgIds: [] };
  }

  logger.info(
    `[FREE TIER USAGE THRESHOLDS] Starting bulk update for ${updates.length} organizations in chunks of ${CHUNK_SIZE}`,
  );

  let successCount = 0;
  const failedOrgIds: string[] = [];

  // Split into chunks
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const chunkOrgIds = chunk.map((u) => u.orgId);
    const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(updates.length / CHUNK_SIZE);

    // Use Promise.allSettled for concurrent, independent updates
    const updateResults = await Promise.allSettled(
      chunk.map((update) =>
        prisma.organization.update({
          where: { id: update.orgId },
          data: {
            cloudCurrentCycleUsage: update.cloudCurrentCycleUsage,
            cloudBillingCycleUpdatedAt: update.cloudBillingCycleUpdatedAt,
            cloudFreeTierUsageThresholdState:
              update.cloudFreeTierUsageThresholdState,
          },
        }),
      ),
    );

    // Track successes and failures at org level
    const chunkFailedOrgIds: string[] = [];
    let chunkSuccessCount = 0;

    updateResults.forEach((result, index) => {
      const update = chunk[index];
      if (result.status === "fulfilled") {
        chunkSuccessCount++;
      } else {
        chunkFailedOrgIds.push(update.orgId);
        // Report individual org failure to Datadog
        traceException(result.reason);
        logger.error(
          `[FREE TIER USAGE THRESHOLDS] Failed to update org ${update.orgId}`,
          result.reason,
        );
      }
    });

    successCount += chunkSuccessCount;
    failedOrgIds.push(...chunkFailedOrgIds);

    logger.info(
      `[FREE TIER USAGE THRESHOLDS] Chunk ${chunkNumber}/${totalChunks}: ${chunkSuccessCount} succeeded, ${chunkFailedOrgIds.length} failed`,
    );

    // Handle cache invalidation for successfully updated orgs that need it
    const orgsNeedingCacheInvalidation = chunk.filter(
      (update, index) =>
        updateResults[index].status === "fulfilled" &&
        update.shouldInvalidateCache,
    );

    for (const update of orgsNeedingCacheInvalidation) {
      try {
        await invalidateCachedOrgApiKeys(update.orgId);
        logger.info(
          `[FREE TIER USAGE THRESHOLDS] Invalidated API key cache for org ${update.orgId}`,
        );
      } catch (cacheError) {
        // Cache invalidation failure shouldn't fail the update
        logger.error(
          `[FREE TIER USAGE THRESHOLDS] Failed to invalidate cache for org ${update.orgId}`,
          cacheError,
        );
        traceException(cacheError);
      }
    }
  }

  const failedCount = failedOrgIds.length;
  const result = { successCount, failedCount, failedOrgIds };

  logger.info(`[FREE TIER USAGE THRESHOLDS] Bulk update completed`, result);

  return result;
}

// NOTE: Future optimization - Option 1 (Raw SQL)
// If Promise.allSettled still causes performance issues due to 1000 round-trips per chunk,
// replace the Promise.allSettled block with a single bulk UPDATE query per chunk:
//
// const valuesClauses = chunk
//   .map((_, idx) => {
//     const base = idx * 4; // 4 parameters per org
//     return `($${base + 1}::uuid, $${base + 2}::integer, $${base + 3}::timestamptz, $${base + 4})`;
//   })
//   .join(", ");
//
// const params = chunk.flatMap((update) => [
//   update.orgId,
//   update.cloudCurrentCycleUsage,
//   update.cloudBillingCycleUpdatedAt,
//   update.cloudFreeTierUsageThresholdState,
// ]);
//
// await prisma.$executeRawUnsafe(
//   `UPDATE organizations AS o SET
//     cloud_current_cycle_usage = v.usage::integer,
//     cloud_billing_cycle_updated_at = v.updated_at::timestamptz,
//     cloud_free_tier_usage_threshold_state = v.state
//   FROM (VALUES ${valuesClauses}) AS v(id, usage, updated_at, state)
//   WHERE o.id = v.id::uuid`,
//   ...params
// );
//
// This would reduce 1000 queries to 1 per chunk, but loses per-org error granularity.
