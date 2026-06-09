import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createTraceScore, createScoresCh } from "@langfuse/shared/src/server";
import { v4 } from "uuid";

export const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const session: Session = {
  user: {
    id: "user-1",
    canCreateOrganizations: true,
    name: "Demo User",
    organizations: [
      {
        id: "seed-org-id",
        name: "Test Organization",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: true,
        projects: [
          {
            id: projectId,
            role: "ADMIN",
            retentionDays: 30,
            deletedAt: null,
            name: "Test Project",
            metadata: {},
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    },
    admin: true,
  },
  environment: {} as any,
  expires: new Date().toISOString(),
};

const ctx = createInnerTRPCContext({ session, headers: {} });
export const caller = appRouter.createCaller({ ...ctx, prisma });
export type ScoreComparisonAnalyticsInput = Parameters<
  typeof caller.scoreAnalytics.getScoreComparisonAnalytics
>[0];
type ScoreComparisonEstimateResults = NonNullable<
  ScoreComparisonAnalyticsInput["estimateResults"]
>;

const defaultEstimateResults: ScoreComparisonEstimateResults = {
  score1Count: 1_000,
  score2Count: 1_000,
  estimatedMatchedCount: 1_000,
};

export const buildEstimateResults = (
  estimatedMatchedCount: number,
): ScoreComparisonEstimateResults => ({
  score1Count: estimatedMatchedCount,
  score2Count: estimatedMatchedCount,
  estimatedMatchedCount,
});

const rawGetScoreComparisonAnalytics =
  caller.scoreAnalytics.getScoreComparisonAnalytics;

export const getScoreComparisonAnalytics = async (
  input: ScoreComparisonAnalyticsInput,
) =>
  rawGetScoreComparisonAnalytics({
    ...input,
    estimateResults: input.estimateResults ?? defaultEstimateResults,
  });

export const getScoreComparisonAnalyticsWithPreflight = async (
  input: ScoreComparisonAnalyticsInput,
) => rawGetScoreComparisonAnalytics(input);

// Most tests validate result shape and aggregation logic, not the preflight query.
// Patch the caller once so those cases skip the duplicate estimate round-trip.
Object.assign(caller.scoreAnalytics, {
  getScoreComparisonAnalytics,
});

export const createOneHourWindow = () => {
  const now = new Date();
  return {
    now,
    fromTimestamp: new Date(now.getTime() - 3600000),
    toTimestamp: new Date(now.getTime() + 3600000),
  };
};

export const insertLargeTraceLevelScorePairs = async ({
  batchSize = 10_000,
  totalRows,
  scoreName1,
  scoreName2,
}: {
  batchSize?: number;
  totalRows: number;
  scoreName1: string;
  scoreName2: string;
}) => {
  const scoreTimestamp = Date.now();

  for (let offset = 0; offset < totalRows; offset += batchSize) {
    const currentBatchSize = Math.min(batchSize, totalRows - offset);
    const scores = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const traceId = v4();

      scores.push(
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "ANNOTATION",
          value: Math.random() * 100,
          data_type: "NUMERIC",
          timestamp: scoreTimestamp,
        }),
      );

      scores.push(
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "ANNOTATION",
          value: Math.random() * 100,
          data_type: "NUMERIC",
          timestamp: scoreTimestamp,
        }),
      );
    }

    await createScoresCh(scores);
  }
};

export const insertLargeIdenticalTraceLevelScores = async ({
  batchSize = 10_000,
  totalRows,
  scoreName,
}: {
  batchSize?: number;
  totalRows: number;
  scoreName: string;
}) => {
  const scoreTimestamp = Date.now();

  for (let offset = 0; offset < totalRows; offset += batchSize) {
    const currentBatchSize = Math.min(batchSize, totalRows - offset);
    const scores = [];

    for (let i = 0; i < currentBatchSize; i++) {
      const traceId = v4();

      scores.push(
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName,
          source: "ANNOTATION",
          value: Math.random() * 100,
          data_type: "NUMERIC",
          timestamp: scoreTimestamp,
        }),
      );
    }

    await createScoresCh(scores);
  }
};
