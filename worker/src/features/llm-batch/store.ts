import {
  LlmBatchRequestStatus,
  Prisma,
  type LlmBatchRequest,
} from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";

export type LlmBatchRow = Pick<
  LlmBatchRequest,
  | "id"
  | "projectId"
  | "jobExecutionId"
  | "llmApiKeyId"
  | "model"
  | "status"
  | "request"
  | "response"
  | "error"
  | "providerJobId"
  | "createdAt"
  | "resumeQueueName"
  | "resumeJobName"
  | "resumeJobData"
>;

/**
 * Claimed rows carry this prefix plus the submission id in providerJobId
 * until the provider job id is saved.
 */
export const CLAIM_PREFIX = "claim:";

/**
 * Persistence for deferred LLM calls. Every state change is a conditional
 * update on the current status, so concurrent ticks on several workers never
 * submit, complete or resume the same row twice.
 */
export interface LlmBatchStore {
  find(projectId: string, jobExecutionId: string): Promise<LlmBatchRow | null>;
  createPending(params: {
    projectId: string;
    jobExecutionId: string;
    llmApiKeyId: string;
    model: string;
    request: Record<string, unknown>;
  }): Promise<LlmBatchRow>;
  setResumeTarget(params: {
    id: string;
    projectId: string;
    queueName: string;
    jobName: string;
    jobData: unknown;
  }): Promise<void>;

  /** Pending rows per connection and model. */
  pendingGroups(): Promise<
    { llmApiKeyId: string; model: string; count: number; oldest: Date }[]
  >;
  /**
   * Atomically claims up to `limit` pending rows of one group. The claim id
   * is also the provider submission id, so a claim whose job id was never
   * saved can be matched to its provider job later.
   */
  claimPending(params: {
    llmApiKeyId: string;
    model: string;
    limit: number;
    claimId: string;
  }): Promise<LlmBatchRow[]>;
  markSubmitted(
    claimId: string,
    providerJobId: string,
    at: Date,
  ): Promise<void>;
  /** Returns the rows of a claim to PENDING. */
  releaseClaim(claimId: string): Promise<void>;
  /**
   * Claims last changed before `before`: the submit failed, or the worker
   * died or lost the database between submit and saving the job id.
   */
  staleClaims(
    before: Date,
  ): Promise<{ claimId: string; llmApiKeyId: string }[]>;

  openProviderJobs(): Promise<{ providerJobId: string; llmApiKeyId: string }[]>;
  rowsOfProviderJob(providerJobId: string): Promise<LlmBatchRow[]>;
  complete(id: string, response: unknown, at: Date): Promise<void>;
  fail(ids: string[], error: string, at: Date): Promise<void>;
  /** Open rows created before `before`. */
  openRowsCreatedBefore(before: Date): Promise<LlmBatchRow[]>;
  /** Open rows (pending or submitted) of a connection. */
  openRowsOfConnection(llmApiKeyId: string): Promise<LlmBatchRow[]>;

  /**
   * Atomically claims finished rows whose evaluation was not resumed yet.
   * A resume claim older than `staleBefore` (the worker died before
   * `markResumed`) is claimed again.
   */
  claimResumable(params: {
    limit: number;
    at: Date;
    staleBefore: Date;
  }): Promise<LlmBatchRow[]>;
  /** The resume job was enqueued. */
  markResumed(id: string, at: Date): Promise<void>;
  unclaimResume(id: string): Promise<void>;
  deleteFinishedBefore(before: Date): Promise<number>;
}

const OPEN_STATUSES = [
  LlmBatchRequestStatus.PENDING,
  LlmBatchRequestStatus.SUBMITTED,
];
const FINISHED_STATUSES = [
  LlmBatchRequestStatus.SUCCEEDED,
  LlmBatchRequestStatus.FAILED,
];

export function createPrismaLlmBatchStore(): LlmBatchStore {
  return {
    find: (projectId, jobExecutionId) =>
      prisma.llmBatchRequest.findUnique({
        where: { projectId_jobExecutionId: { projectId, jobExecutionId } },
      }),

    createPending: (params) =>
      prisma.llmBatchRequest.upsert({
        where: {
          projectId_jobExecutionId: {
            projectId: params.projectId,
            jobExecutionId: params.jobExecutionId,
          },
        },
        create: {
          ...params,
          request: params.request as Prisma.InputJsonObject,
        },
        update: {},
      }),

    setResumeTarget: async ({ id, projectId, queueName, jobName, jobData }) => {
      await prisma.llmBatchRequest.update({
        where: { id, projectId },
        data: {
          resumeQueueName: queueName,
          resumeJobName: jobName,
          resumeJobData: jobData as Prisma.InputJsonValue,
        },
      });
    },

    pendingGroups: async () => {
      const groups = await prisma.llmBatchRequest.groupBy({
        by: ["llmApiKeyId", "model"],
        where: { status: LlmBatchRequestStatus.PENDING },
        _count: { _all: true },
        _min: { createdAt: true },
      });
      return groups.map((g) => ({
        llmApiKeyId: g.llmApiKeyId,
        model: g.model,
        count: g._count._all,
        oldest: g._min.createdAt ?? new Date(),
      }));
    },

    claimPending: async ({ llmApiKeyId, model, limit, claimId }) => {
      const candidates = await prisma.llmBatchRequest.findMany({
        where: { status: LlmBatchRequestStatus.PENDING, llmApiKeyId, model },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true },
      });
      if (candidates.length === 0) return [];
      await prisma.llmBatchRequest.updateMany({
        where: {
          id: { in: candidates.map((c) => c.id) },
          status: LlmBatchRequestStatus.PENDING,
        },
        data: {
          status: LlmBatchRequestStatus.SUBMITTED,
          providerJobId: `${CLAIM_PREFIX}${claimId}`,
        },
      });
      return prisma.llmBatchRequest.findMany({
        where: { providerJobId: `${CLAIM_PREFIX}${claimId}` },
      });
    },

    markSubmitted: async (claimId, providerJobId, at) => {
      await prisma.llmBatchRequest.updateMany({
        where: { providerJobId: `${CLAIM_PREFIX}${claimId}` },
        data: { providerJobId, submittedAt: at },
      });
    },

    releaseClaim: async (claimId) => {
      await prisma.llmBatchRequest.updateMany({
        where: { providerJobId: `${CLAIM_PREFIX}${claimId}` },
        data: { status: LlmBatchRequestStatus.PENDING, providerJobId: null },
      });
    },

    staleClaims: async (before) => {
      const claims = await prisma.llmBatchRequest.findMany({
        where: {
          status: LlmBatchRequestStatus.SUBMITTED,
          providerJobId: { startsWith: CLAIM_PREFIX },
          updatedAt: { lt: before },
        },
        distinct: ["providerJobId"],
        select: { providerJobId: true, llmApiKeyId: true },
      });
      return claims.flatMap((c) =>
        c.providerJobId
          ? [
              {
                claimId: c.providerJobId.slice(CLAIM_PREFIX.length),
                llmApiKeyId: c.llmApiKeyId,
              },
            ]
          : [],
      );
    },

    openProviderJobs: async () => {
      const jobs = await prisma.llmBatchRequest.findMany({
        where: {
          status: LlmBatchRequestStatus.SUBMITTED,
          submittedAt: { not: null },
          NOT: { providerJobId: { startsWith: CLAIM_PREFIX } },
        },
        distinct: ["providerJobId"],
        select: { providerJobId: true, llmApiKeyId: true },
      });
      return jobs.flatMap((j) =>
        j.providerJobId
          ? [{ providerJobId: j.providerJobId, llmApiKeyId: j.llmApiKeyId }]
          : [],
      );
    },

    rowsOfProviderJob: (providerJobId) =>
      prisma.llmBatchRequest.findMany({
        where: { providerJobId, status: LlmBatchRequestStatus.SUBMITTED },
      }),

    complete: async (id, response, at) => {
      await prisma.llmBatchRequest.updateMany({
        where: { id, status: { in: OPEN_STATUSES } },
        data: {
          status: LlmBatchRequestStatus.SUCCEEDED,
          response: response as Prisma.InputJsonValue,
          completedAt: at,
        },
      });
    },

    fail: async (ids, error, at) => {
      if (ids.length === 0) return;
      await prisma.llmBatchRequest.updateMany({
        where: { id: { in: ids }, status: { in: OPEN_STATUSES } },
        data: { status: LlmBatchRequestStatus.FAILED, error, completedAt: at },
      });
    },

    openRowsCreatedBefore: (before) =>
      prisma.llmBatchRequest.findMany({
        where: { status: { in: OPEN_STATUSES }, createdAt: { lt: before } },
        take: 1000,
      }),

    openRowsOfConnection: (llmApiKeyId) =>
      prisma.llmBatchRequest.findMany({
        where: { status: { in: OPEN_STATUSES }, llmApiKeyId },
        take: 1000,
      }),

    claimResumable: async ({ limit, at, staleBefore }) => {
      const candidates = await prisma.llmBatchRequest.findMany({
        where: {
          status: { in: FINISHED_STATUSES },
          resumedAt: null,
          resumeQueueName: { not: null },
          OR: [
            { resumeClaimedAt: null },
            { resumeClaimedAt: { lt: staleBefore } },
          ],
        },
        orderBy: { completedAt: "asc" },
        take: limit,
        select: { id: true, resumeClaimedAt: true },
      });
      const claimed: LlmBatchRow[] = [];
      for (const { id, resumeClaimedAt } of candidates) {
        // Conditional on the claim we read: two workers never both win.
        const res = await prisma.llmBatchRequest.updateMany({
          where: { id, resumedAt: null, resumeClaimedAt },
          data: { resumeClaimedAt: at },
        });
        if (res.count === 1) {
          const row = await prisma.llmBatchRequest.findUnique({
            where: { id },
          });
          if (row) claimed.push(row);
        }
      }
      return claimed;
    },

    markResumed: async (id, at) => {
      await prisma.llmBatchRequest.updateMany({
        where: { id },
        data: { resumedAt: at },
      });
    },

    unclaimResume: async (id) => {
      await prisma.llmBatchRequest.updateMany({
        where: { id, resumedAt: null },
        data: { resumeClaimedAt: null },
      });
    },

    deleteFinishedBefore: async (before) => {
      const res = await prisma.llmBatchRequest.deleteMany({
        where: {
          status: { in: FINISHED_STATUSES },
          completedAt: { lt: before },
          resumedAt: { not: null },
        },
      });
      return res.count;
    },
  };
}
