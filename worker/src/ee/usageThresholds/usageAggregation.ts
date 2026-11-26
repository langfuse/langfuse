import { prisma } from "@langfuse/shared/src/db";
import {
  getBillableUnitCountsForAllProjectsInRange,
  getBillingCycleStart,
  startOfDayUTC,
  endOfDayUTC,
  getDaysToLookBack,
  recordIncrement,
  instrumentAsync,
} from "@langfuse/shared/src/server";

import { parseDbOrg, type ParsedOrganization } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { backOff } from "exponential-backoff";

import { env } from "../../env";

import {
  processThresholds,
  type ThresholdProcessingResult,
  type OrgUpdateData,
} from "./thresholdProcessing";
import { bulkUpdateOrganizationsRawSQL } from "./bulkUpdates";

const DAILY_QUERY_MAX_ATTEMPTS = 3;

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return backOff(fn, {
    numOfAttempts: DAILY_QUERY_MAX_ATTEMPTS,
    startingDelay: 500,
    timeMultiple: 2,
    retry: (error: Error, attemptNumber: number) => {
      logger.warn(
        `[FREE TIER USAGE THRESHOLDS] ${label} failed (attempt ${attemptNumber}/${DAILY_QUERY_MAX_ATTEMPTS}): ${error.message}`,
        { error: error.message, attemptNumber },
      );
      return attemptNumber < DAILY_QUERY_MAX_ATTEMPTS;
    },
  });
}

/**
 * Map of projectId to orgId
 */
interface ProjectToOrgMap {
  [projectId: string]: string;
}

/**
 * Billable units aggregated at org level
 */
interface UsageByOrg {
  [orgId: string]: number;
}

/**
 * Organization with calculated billing cycle start date
 */
interface OrgWithBillingStart extends ParsedOrganization {
  billingCycleStartForReference: Date;
}

/**
 * Build a map of projectId → orgId for all projects
 */
async function buildProjectToOrgMap(): Promise<ProjectToOrgMap> {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      orgId: true,
    },
  });

  const map: ProjectToOrgMap = {};
  for (const project of projects) {
    map[project.id] = project.orgId;
  }

  return map;
}

/**
 * Fetch all organizations with billing-related fields
 * Uses parseDbOrg to properly parse cloudConfig
 */
async function fetchAllOrgsWithBillingInfo(): Promise<ParsedOrganization[]> {
  const orgs = await prisma.organization.findMany();

  return orgs.map((org) => parseDbOrg(org));
}

/**
 * Aggregate project-level billable unit counts to org-level totals
 */
function aggregateByOrg(
  unitCounts: Array<{ count: number; projectId: string }>,
  projectToOrgMap: ProjectToOrgMap,
): UsageByOrg {
  const orgCounts: UsageByOrg = {};

  for (const row of unitCounts) {
    const orgId = projectToOrgMap[row.projectId];
    if (!orgId) {
      logger.warn(
        `[FREE TIER USAGE THRESHOLDS] aggregateByOrg: Project ${row.projectId} not found in projectToOrgMap`,
      );
      continue;
    }

    orgCounts[orgId] = (orgCounts[orgId] ?? 0) + row.count;
  }

  return orgCounts;
}

/**
 * Statistics returned from usage aggregation processing
 */
export type UsageAggregationStats = {
  totalOrgsProcessed: number;
  totalOrgsUpdatedSuccessfully: number;
  totalOrgsFailed: number;
  failedOrgIds: string[];
};

/**
 * Main orchestrator: Process usage aggregation for all organizations
 *
 * Algorithm:
 * 1. Setup: Fetch project→org map, all orgs, calculate billing starts
 * 2. Process day-by-day backwards from referenceDate (0 to 31 days ago)
 * 3. For each day:
 *    - Fetch billable units ingested that day from the billable_events
 *      ledger (1 query for ALL projects)
 *    - Aggregate to org level
 *    - Accumulate into running totals
 *    - Process orgs whose billing cycle starts on THIS day
 *
 * @param referenceDate - Date to process from (default: now)
 * @param onProgress - Optional callback to report progress (0.0 to 1.0)
 * @returns Statistics about the processing run
 */
export async function processUsageAggregationForAllOrgs(
  referenceDate: Date = new Date(),
  onProgress?: (progress: number) => void | Promise<void>,
): Promise<UsageAggregationStats> {
  // The billing ledger is filled from events_full, which legacy mode never
  // writes. Counting an empty ledger would clear every org's usage and blocks.
  if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy") {
    throw new Error(
      "Free-tier usage thresholds do not support LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy",
    );
  }

  // Normalize referenceDate to UTC end of day
  const normalizedReferenceDate = endOfDayUTC(referenceDate);

  // Setup
  const projectToOrgMap = await buildProjectToOrgMap();
  const allOrgs = await fetchAllOrgsWithBillingInfo();
  const orgsWithBillingStarts = allOrgs.map((org) => ({
    ...org,
    billingCycleStartForReference: getBillingCycleStart(
      org,
      normalizedReferenceDate,
    ),
  }));

  // Group orgs by billing cycle start date for efficient lookup
  const orgsByBillingStartMap = new Map<string, OrgWithBillingStart[]>();
  for (const org of orgsWithBillingStarts) {
    const dateString = org.billingCycleStartForReference
      .toISOString()
      .split("T")[0];
    if (!orgsByBillingStartMap.has(dateString)) {
      orgsByBillingStartMap.set(dateString, []);
    }
    orgsByBillingStartMap.get(dateString)!.push(org);
  }

  // Initialize usage state for all orgs
  const usageByOrgMap: UsageByOrg = {};
  for (const org of allOrgs) {
    usageByOrgMap[org.id] = 0;
  }

  // Initialize statistics tracking
  const stats: UsageAggregationStats = {
    totalOrgsProcessed: 0,
    totalOrgsUpdatedSuccessfully: 0,
    totalOrgsFailed: 0,
    failedOrgIds: [],
  };

  // Calculate how many days to look back (based on previous month's length)
  const daysToLookBack = getDaysToLookBack(normalizedReferenceDate);

  // Process day-by-day (backwards from referenceDate)
  const totalDays = daysToLookBack + 1; // Total days to process (0 to daysToLookBack inclusive)

  for (let daysAgo = 0; daysAgo <= daysToLookBack; daysAgo++) {
    const dayDate = new Date(normalizedReferenceDate);
    dayDate.setUTCDate(dayDate.getUTCDate() - daysAgo);

    const dayStart = startOfDayUTC(dayDate);

    // For today (daysAgo === 0), use normalizedReferenceDate as end time
    // For past days, use end of day
    const dayEnd =
      daysAgo === 0 ? normalizedReferenceDate : endOfDayUTC(dayDate);

    const dayDateString = dayStart.toISOString().split("T")[0];

    await instrumentAsync(
      { name: "cloud-free-tier-usage-threshold-day" },
      async (span) => {
        span.setAttribute(
          "langfuse.free_tier.dayStart",
          dayStart.toISOString(),
        );
        span.setAttribute("langfuse.free_tier.dayEnd", dayEnd.toISOString());
        span.setAttribute("langfuse.free_tier.dayDate", dayDateString);
        span.setAttribute("langfuse.free_tier.daysAgo", daysAgo);

        // Billable units ingested this day, for ALL projects. The query gets
        // an extended timeout and automatic retries — a single re-run is cheap
        // compared to failing the whole job.
        const unitCounts = await withRetry(
          "getBillableUnitCountsForAllProjectsInRange",
          () =>
            getBillableUnitCountsForAllProjectsInRange({
              from: dayStart,
              to: dayEnd,
            }),
        );

        // Aggregate to org level
        const orgDailyCounts = aggregateByOrg(unitCounts, projectToOrgMap);

        // Accumulate for all orgs and previous days
        for (const [orgId, count] of Object.entries(orgDailyCounts)) {
          if (orgId in usageByOrgMap) {
            usageByOrgMap[orgId] += count;
          }
        }

        // Process orgs with billing cycle starting THIS day
        const orgsToProcess = orgsByBillingStartMap.get(dayDateString) || [];

        // Collect updates instead of executing immediately
        const updatesToProcess: OrgUpdateData[] = [];

        for (const org of orgsToProcess) {
          const usage = usageByOrgMap[org.id];
          if (usage !== undefined) {
            const result: ThresholdProcessingResult = await processThresholds(
              org,
              usage,
            );

            // Collect the update data for bulk processing
            updatesToProcess.push(result.updateData);

            // Track statistics with increments
            recordIncrement(
              "langfuse.queue.usage_threshold_queue.total_orgs",
              1,
              {
                unit: "organizations",
              },
            );

            if (result.actionTaken === "PAID_PLAN") {
              recordIncrement(
                "langfuse.queue.usage_threshold_queue.paid_plan_orgs",
                1,
                {
                  unit: "organizations",
                },
              );
            } else {
              // Count as free tier if not paid plan
              recordIncrement(
                "langfuse.queue.usage_threshold_queue.free_tier_orgs",
                1,
                {
                  unit: "organizations",
                },
              );
            }
          }
        }

        // Execute bulk update after processing all orgs for this day
        if (updatesToProcess.length > 0) {
          const bulkResult =
            await bulkUpdateOrganizationsRawSQL(updatesToProcess);

          logger.info(
            `[FREE TIER USAGE THRESHOLDS] Day ${dayDateString}: Bulk updated ${bulkResult.successCount} orgs, ${bulkResult.failedCount} failed`,
          );

          // Track bulk update statistics
          stats.totalOrgsProcessed += updatesToProcess.length;
          stats.totalOrgsUpdatedSuccessfully += bulkResult.successCount;
          stats.totalOrgsFailed += bulkResult.failedCount;
          stats.failedOrgIds.push(...bulkResult.failedOrgIds);

          // Track bulk update failures metric
          if (bulkResult.failedCount > 0) {
            recordIncrement(
              "langfuse.queue.usage_threshold_queue.bulk_update_failures",
              bulkResult.failedCount,
              { unit: "organizations" },
            );
          }
        }
      },
    );

    // Update progress
    if (onProgress) {
      const progress = (daysAgo + 1) / totalDays;
      await onProgress(progress);
    }
  }

  return stats;
}

/** @internal */
export { buildProjectToOrgMap, aggregateByOrg };
