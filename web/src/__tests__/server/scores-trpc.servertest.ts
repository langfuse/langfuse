/** @jest-environment node */

const mockAddScoreDelete = jest.fn();
const mockAddBatchAction = jest.fn();

jest.mock("@langfuse/shared/src/server", () => {
  const originalModule = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    ScoreDeleteQueue: {
      getInstance: jest.fn(() => ({
        add: mockAddScoreDelete,
      })),
    },
    BatchActionQueue: {
      getInstance: jest.fn(() => ({
        add: mockAddBatchAction,
      })),
    },
  };
});

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createObservation,
  createObservationsCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  createScoresCh,
  ScoreDeleteQueue,
  BatchActionQueue,
  QueueJobs,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("scores trpc", () => {
  let projectId: string;
  let orgId: string;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    projectId = setup.projectId;
    orgId = setup.orgId;
    mockAddScoreDelete.mockClear();
    mockAddBatchAction.mockClear();

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: orgId,
            name: "Test Organization",
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            projects: [
              {
                id: projectId,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: "Test Project",
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
    };

    const ctx = createInnerTRPCContext({ session });
    caller = appRouter.createCaller({ ...ctx, prisma });
  });

  describe("scores.deleteMany", () => {
    it("should delete scores by ids", async () => {
      // Setup
      const createdScore = createTraceScore({
        project_id: projectId,
      });
      await createScoresCh([createdScore]);
      const scoreDeleteQueue = ScoreDeleteQueue.getInstance();

      // When
      await caller.scores.deleteMany({
        projectId,
        scoreIds: [createdScore.id],
      });

      expect(scoreDeleteQueue).not.toBeNull();

      // Then
      expect(scoreDeleteQueue!.add).toHaveBeenCalledWith(
        QueueJobs.ScoreDelete,
        expect.objectContaining({
          payload: expect.objectContaining({
            projectId,
            scoreIds: [createdScore.id],
          }),
        }),
      );
    });

    it("should delete scores via batch query", async () => {
      // Setup
      const scoreName = randomUUID();
      const createdScore = createTraceScore({
        project_id: projectId,
        name: scoreName,
      });
      await createScoresCh([createdScore]);
      const batchActionQueue = BatchActionQueue.getInstance();

      // When
      await caller.scores.deleteMany({
        projectId,
        scoreIds: null,
        isBatchAction: true,
        query: {
          orderBy: { column: "timestamp", order: "ASC" },
          filter: [
            {
              column: "name",
              operator: "=",
              value: scoreName,
              type: "string",
            },
          ],
        },
      });

      expect(batchActionQueue).not.toBeNull();

      // Then
      expect(batchActionQueue!.add).toHaveBeenCalledWith(
        QueueJobs.BatchActionProcessingJob,
        expect.objectContaining({
          payload: expect.objectContaining({
            projectId,
            actionId: "score-delete",
          }),
        }),
        expect.objectContaining({}),
      );
    });

    it("should throw an error if batchAction and scoreIds are missing", async () => {
      // When
      const promise = caller.scores.deleteMany({
        projectId,
        scoreIds: null,
        isBatchAction: false,
      });

      // Then
      await expect(promise).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message:
          "Either batchAction or scoreIds must be provided to delete scores.",
      });
    });
  });

  describe("scores.getScoreColumns", () => {
    it("should distinguish trace-level from trace-scoped score discovery", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();

      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
        }),
      ]);
      await createObservationsCh([
        createObservation({
          id: observationId,
          trace_id: traceId,
          project_id: projectId,
        }),
      ]);

      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: "trace_level_score",
          source: "API",
          data_type: "NUMERIC",
          value: 0.9,
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: observationId,
          name: "observation_level_score",
          source: "API",
          data_type: "NUMERIC",
          value: 0.7,
        }),
      ]);

      const traceScopedColumns = await caller.scores.getScoreColumns({
        projectId,
        filter: [
          {
            column: "traceId",
            operator: "is not null",
            value: "",
            type: "null",
          },
        ],
      });

      const traceLevelColumns = await caller.scores.getScoreColumns({
        projectId,
        filter: [
          {
            column: "traceId",
            operator: "is not null",
            value: "",
            type: "null",
          },
          {
            column: "observationId",
            operator: "is null",
            value: "",
            type: "null",
          },
        ],
      });

      expect(
        traceScopedColumns.scoreColumns.map((column) => column.name),
      ).toEqual(
        expect.arrayContaining([
          "trace_level_score",
          "observation_level_score",
        ]),
      );
      expect(
        traceLevelColumns.scoreColumns.map((column) => column.name),
      ).toEqual(["trace_level_score"]);
    });
  });
});
