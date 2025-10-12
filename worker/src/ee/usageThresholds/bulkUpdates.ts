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
 * Default chunk size for bulk operations
 * 1000 orgs per transaction provides good balance between:
 * - Reducing round trips (vs individual updates)
 * - Not overwhelming single transaction (vs all at once)
 * - Memory usage (~100KB per chunk)
 */
const DEFAULT_CHUNK_SIZE = 1000;

/**
 * Bulk update organizations with per-chunk transactions
 *
 * Behavior:
 * - Each chunk of org updates is executed within a single transaction
 * - If any update in the chunk fails, the entire chunk is rolled back
 * - Failed chunks are reported via traceException and all orgs in the chunk are marked failed
 * - Successful chunks commit all org updates in that chunk
 *
 * @param updates - Array of org update data
 * @param chunkSize - Optional chunk size (default: 1000)
 * @returns Summary of successful/failed updates
 */
export async function bulkUpdateOrganizations(
  updates: OrgUpdateData[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<BulkUpdateResult> {
  if (updates.length === 0) {
    return { successCount: 0, failedCount: 0, failedOrgIds: [] };
  }

  logger.info(
    `[FREE TIER USAGE THRESHOLDS] Starting bulk update (Transaction) for ${updates.length} organizations in chunks of ${chunkSize}`,
  );

  let successCount = 0;
  const failedOrgIds: string[] = [];

  // Split into chunks
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(updates.length / chunkSize);

    try {
      // Execute all updates in this chunk within a single transaction
      await prisma.$transaction(
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

      successCount += chunk.length;

      logger.info(
        `[FREE TIER USAGE THRESHOLDS] Chunk ${chunkNumber}/${totalChunks}: ${chunk.length} succeeded`,
      );

      // Invalidate caches for orgs in this successful chunk that need it
      const orgsNeedingCacheInvalidation = chunk.filter(
        (u) => u.shouldInvalidateCache,
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
    } catch (error) {
      // Entire chunk failed - report and mark all orgs in this chunk as failed
      traceException(error);
      const chunkOrgIds = chunk.map((u) => u.orgId);
      logger.error(
        `[FREE TIER USAGE THRESHOLDS] Failed to update chunk ${chunkNumber}/${totalChunks} (Transaction)`,
        {
          chunkSize: chunk.length,
          chunkIndex: chunkNumber - 1,
          orgIds: chunkOrgIds,
          error,
        },
      );
      failedOrgIds.push(...chunkOrgIds);
    }
  }

  const failedCount = failedOrgIds.length;
  const result = { successCount, failedCount, failedOrgIds };

  logger.info(
    `[FREE TIER USAGE THRESHOLDS] Bulk update (Promise.allSettled) completed`,
    result,
  );

  return result;
}

/**
 * Bulk update organizations using raw SQL batch UPDATE (single query per chunk)
 *
 * This is the Option 1 implementation using PostgreSQL VALUES clause for true bulk updates.
 * Much faster than Promise.allSettled but loses per-org error granularity.
 *
 * Error handling:
 * - Entire chunk succeeds or fails as a unit
 * - Failed chunks reported to Datadog via traceException
 * - Successful chunks are committed
 *
 * @param updates - Array of org update data
 * @param chunkSize - Optional chunk size (default: 10 for testing)
 * @returns Summary of successful/failed updates
 */
export async function bulkUpdateOrganizationsRawSQL(
  updates: OrgUpdateData[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<BulkUpdateResult> {
  if (updates.length === 0) {
    return { successCount: 0, failedCount: 0, failedOrgIds: [] };
  }

  logger.info(
    `[FREE TIER USAGE THRESHOLDS] Starting bulk update (Raw SQL) for ${updates.length} organizations in chunks of ${chunkSize}`,
  );

  let successCount = 0;
  const failedOrgIds: string[] = [];

  // Split into chunks
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(updates.length / chunkSize);

    try {
      // Build VALUES clause: (id, usage, updated_at, state)
      const valuesClauses = chunk
        .map((_, idx) => {
          const base = idx * 4; // 4 parameters per org
          return `($${base + 1}, $${base + 2}::integer, $${base + 3}::timestamptz, $${base + 4})`;
        })
        .join(", ");

      const params = chunk.flatMap((update) => [
        update.orgId,
        update.cloudCurrentCycleUsage,
        update.cloudBillingCycleUpdatedAt,
        update.cloudFreeTierUsageThresholdState,
      ]);

      // Execute single bulk UPDATE for entire chunk
      await prisma.$executeRawUnsafe(
        `UPDATE organizations AS o SET
          cloud_current_cycle_usage = v.usage::integer,
          cloud_billing_cycle_updated_at = v.updated_at::timestamptz,
          cloud_free_tier_usage_threshold_state = v.state
        FROM (VALUES ${valuesClauses}) AS v(id, usage, updated_at, state)
        WHERE o.id::text = v.id::text`,
        ...params,
      );

      successCount += chunk.length;

      logger.info(
        `[FREE TIER USAGE THRESHOLDS] Chunk ${chunkNumber}/${totalChunks}: ${chunk.length} succeeded (Raw SQL)`,
      );

      // Handle cache invalidation for orgs in this successful chunk
      const orgsNeedingCacheInvalidation = chunk.filter(
        (u) => u.shouldInvalidateCache,
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
    } catch (error) {
      // Entire chunk failed - report to Datadog but continue processing
      traceException(error);

      const chunkOrgIds = chunk.map((u) => u.orgId);
      logger.error(
        `[FREE TIER USAGE THRESHOLDS] Failed to update chunk ${chunkNumber}/${totalChunks} (Raw SQL)`,
        {
          chunkSize: chunk.length,
          chunkIndex: chunkNumber - 1,
          orgIds: chunkOrgIds,
          error,
        },
      );

      failedOrgIds.push(...chunkOrgIds);
    }
  }

  const failedCount = failedOrgIds.length;
  const result = { successCount, failedCount, failedOrgIds };

  logger.info(
    `[FREE TIER USAGE THRESHOLDS] Bulk update (Raw SQL) completed`,
    result,
  );

  return result;
}
