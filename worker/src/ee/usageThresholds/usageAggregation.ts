import { prisma } from "@langfuse/shared/src/db";
import {
  getTraceCountsByProjectAndDay,
  getObservationCountsByProjectAndDay,
  getScoreCountsByProjectAndDay,
  getBillingCycleStart,
  startOfDayUTC,
  endOfDayUTC,
  getDaysToLookBack,
  recordIncrement,
} from "@langfuse/shared/src/server";

import { parseDbOrg, type ParsedOrganization } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

import {
  processThresholds,
  type ThresholdProcessingResult,
  type OrgUpdateData,
} from "./thresholdProcessing";
import { bulkUpdateOrganizationsRawSQL } from "./bulkUpdates";

/**
 * Map of projectId to orgId
 */
interface ProjectToOrgMap {
  [projectId: string]: string;
}

/**
 * Usage counts aggregated at org level
 */
interface UsageByOrg {
  [orgId: string]: {
    traces: number;
    observations: number;
    scores: number;
    total: number;
  };
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
 * Aggregate project-level counts to org-level counts
 */
function aggregateByOrg(
  traceCounts: Array<{ count: number; projectId: string; date: string }>,
  obsCounts: Array<{ count: number; projectId: string; date: string }>,
  scoreCounts: Array<{ count: number; projectId: string; date: string }>,
  projectToOrgMap: ProjectToOrgMap,
): UsageByOrg {
  const orgCounts: UsageByOrg = {};

  // Aggregate traces
  for (const row of traceCounts) {
    const orgId = projectToOrgMap[row.projectId];
    if (!orgId) {
      logger.warn(
        `[FREE TIER USAGE THRESHOLDS] aggregateByOrg: Project ${row.projectId} not found in projectToOrgMap`,
      );
      continue;
    }

    if (!orgCounts[orgId]) {
      orgCounts[orgId] = { traces: 0, observations: 0, scores: 0, total: 0 };
    }
    orgCounts[orgId].traces += row.count;
  }

  // Aggregate observations
  for (const row of obsCounts) {
    const orgId = projectToOrgMap[row.projectId];
    if (!orgId) {
      logger.warn(
        `[FREE TIER USAGE THRESHOLDS] aggregateByOrg: Project ${row.projectId} not found in projectToOrgMap`,
      );
      continue;
    }

    if (!orgCounts[orgId]) {
      orgCounts[orgId] = { traces: 0, observations: 0, scores: 0, total: 0 };
    }
    orgCounts[orgId].observations += row.count;
  }

  // Aggregate scores
  for (const row of scoreCounts) {
    const orgId = projectToOrgMap[row.projectId];
    if (!orgId) {
      logger.warn(
        `[FREE TIER USAGE THRESHOLDS] aggregateByOrg: Project ${row.projectId} not found in projectToOrgMap`,
      );
      continue;
    }

    if (!orgCounts[orgId]) {
      orgCounts[orgId] = { traces: 0, observations: 0, scores: 0, total: 0 };
    }
    orgCounts[orgId].scores += row.count;
  }

  // Calculate totals
  for (const orgId of Object.keys(orgCounts)) {
    const counts = orgCounts[orgId];
    counts.total = counts.traces + counts.observations + counts.scores;
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
 *    - Fetch counts from Clickhouse (3 queries for ALL projects)
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
  onProgress?: (progress: number) => void | Promise<void>, // eslint-disable-line no-unused-vars
): Promise<UsageAggregationStats> {
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
    usageByOrgMap[org.id] = { traces: 0, observations: 0, scores: 0, total: 0 };
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

    // Fetch counts from Clickhouse (3 queries for ALL projects)
    const [traceCounts, obsCounts, scoreCounts] = await Promise.all([
      getTraceCountsByProjectAndDay({ startDate: dayStart, endDate: dayEnd }),
      getObservationCountsByProjectAndDay({
        startDate: dayStart,
        endDate: dayEnd,
      }),
      getScoreCountsByProjectAndDay({ startDate: dayStart, endDate: dayEnd }),
    ]);

    // Aggregate to org level
    const orgDailyCounts = aggregateByOrg(
      traceCounts,
      obsCounts,
      scoreCounts,
      projectToOrgMap,
    );

    // Accumulate for all orgs and previous days
    for (const [orgId, counts] of Object.entries(orgDailyCounts)) {
      const state = usageByOrgMap[orgId];
      if (state) {
        state.traces += counts.traces;
        state.observations += counts.observations;
        state.scores += counts.scores;
        state.total += counts.total;
      }
    }

    // Process orgs with billing cycle starting THIS day
    const dayDateString = dayStart.toISOString().split("T")[0];
    const orgsToProcess = orgsByBillingStartMap.get(dayDateString) || [];

    // Collect updates instead of executing immediately
    const updatesToProcess: OrgUpdateData[] = [];

    for (const org of orgsToProcess) {
      const state = usageByOrgMap[org.id];
      if (state) {
        const result: ThresholdProcessingResult = await processThresholds(
          org,
          state.total,
        );

        // Collect the update data for bulk processing
        updatesToProcess.push(result.updateData);

        // Track statistics with increments
        recordIncrement("langfuse.queue.usage_threshold_queue.total_orgs", 1, {
          unit: "organizations",
        });

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
      const bulkResult = await bulkUpdateOrganizationsRawSQL(updatesToProcess);

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

    // Update progress
    if (onProgress) {
      const progress = (daysAgo + 1) / totalDays;
      await onProgress(progress);
    }
  }

  return stats;
}

// Export helper functions for testing
export { buildProjectToOrgMap, fetchAllOrgsWithBillingInfo, aggregateByOrg };
