const {
  mockAddScoreDelete,
  mockAddBatchAction,
  mockGetEventsGroupedByTraceTags,
  mockGetEventsGroupedByTraceName,
  mockGetEventsGroupedByUserId,
} = vi.hoisted(() => ({
  mockAddScoreDelete: vi.fn(),
  mockAddBatchAction: vi.fn(),
  mockGetEventsGroupedByTraceTags: vi.fn(async () => []),
  mockGetEventsGroupedByTraceName: vi.fn(async () => []),
  mockGetEventsGroupedByUserId: vi.fn(async () => []),
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const originalModule = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    ScoreDeleteQueue: {
      getInstance: vi.fn(() => ({
        add: mockAddScoreDelete,
      })),
    },
    BatchActionQueue: {
      getInstance: vi.fn(() => ({
        add: mockAddBatchAction,
      })),
    },
    getEventsGroupedByTraceTags: mockGetEventsGroupedByTraceTags,
    getEventsGroupedByTraceName: mockGetEventsGroupedByTraceName,
    getEventsGroupedByUserId: mockGetEventsGroupedByUserId,
  };
});

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { ScoreConfigDataType } from "@langfuse/shared";
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
    mockGetEventsGroupedByTraceTags.mockClear();
    mockGetEventsGroupedByTraceName.mockClear();
    mockGetEventsGroupedByUserId.mockClear();

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
                hasTraces: false,
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
          searchBar: false,
          v4BetaToggleVisible: false,
          observationEvals: false,
          experimentsV4Enabled: false,
        },
        admin: true,
      },
      environment: {} as any,
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    caller = appRouter.createCaller({ ...ctx, prisma });
  });

  describe("scores.all", () => {
    it("does not match empty boolean representations when filtering boolean values", async () => {
      const trueBooleanScore = createTraceScore({
        project_id: projectId,
        name: "boolean-score-true",
        data_type: "BOOLEAN",
        value: 1,
        string_value: "True",
      });
      const falseBooleanScore = createTraceScore({
        project_id: projectId,
        name: "boolean-score-false",
        data_type: "BOOLEAN",
        value: 0,
        string_value: "False",
      });
      const emptyBooleanScore = createTraceScore({
        project_id: projectId,
        name: "boolean-score-empty",
        data_type: "BOOLEAN",
        value: 1,
        string_value: "",
      });
      const numericScore = createTraceScore({
        project_id: projectId,
        name: "numeric-score",
        data_type: "NUMERIC",
        value: 0.7,
        string_value: null,
      });

      await createScoresCh([
        trueBooleanScore,
        falseBooleanScore,
        emptyBooleanScore,
        numericScore,
      ]);

      const payload = {
        projectId,
        filter: [
          {
            column: "booleanValue",
            type: "stringOptions" as const,
            operator: "none of" as const,
            value: ["false"],
          },
        ],
        orderBy: { column: "timestamp", order: "DESC" as const },
        page: 0,
        limit: 50,
      };

      const result = await caller.scores.all(payload);
      const resultFromEvents = await caller.scores.allFromEvents(payload);

      expect(result.scores.map((score) => score.id)).toEqual([
        trueBooleanScore.id,
      ]);
      expect(resultFromEvents.scores.map((score) => score.id)).toEqual([
        trueBooleanScore.id,
      ]);
    });
  });

  describe("scores.createAnnotationScore", () => {
    it("rejects empty stringValue for boolean annotation scores", async () => {
      const configId = randomUUID();
      const scoreName = `boolean-annotation-score-${configId.slice(0, 8)}`;

      await expect(
        caller.scores.createAnnotationScore({
          projectId,
          name: scoreName,
          value: 1,
          stringValue: "",
          dataType: "BOOLEAN",
          scoreTarget: { type: "trace", traceId: randomUUID() },
          configId,
          environment: "default",
        } as any),
      ).rejects.toThrow();
    });

    it("accepts explicit boolean annotation stringValue labels", async () => {
      const traceId = randomUUID();
      const configId = randomUUID();
      const scoreName = `boolean-annotation-score-${configId.slice(0, 8)}`;

      await createTracesCh([
        createTrace({
          id: traceId,
          project_id: projectId,
        }),
      ]);
      await prisma.scoreConfig.create({
        data: {
          id: configId,
          projectId,
          name: scoreName,
          dataType: ScoreConfigDataType.BOOLEAN,
          categories: [
            { label: "True", value: 1 },
            { label: "False", value: 0 },
          ],
        },
      });

      const score = await caller.scores.createAnnotationScore({
        projectId,
        name: scoreName,
        value: 1,
        stringValue: "True",
        dataType: "BOOLEAN",
        scoreTarget: { type: "trace", traceId },
        configId,
        environment: "default",
      });

      expect(score.stringValue).toBe("True");
    });
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

  describe("scores.filterOptions", () => {
    it("returns static boolean value options for both scores views", async () => {
      await expect(
        caller.scores.filterOptions({ projectId }),
      ).resolves.toMatchObject({
        booleanValue: [{ value: "true" }, { value: "false" }],
      });

      await expect(
        caller.scores.filterOptionsFromEvents({ projectId }),
      ).resolves.toMatchObject({
        booleanValue: [{ value: "true" }, { value: "false" }],
      });
    });
  });

  describe("scoreConfigs.all", () => {
    it("should paginate score configs deterministically when createdAt timestamps tie", async () => {
      const sharedCreatedAt = new Date("2100-05-12T00:00:00.000Z");
      const configIds: string[] = [randomUUID(), randomUUID(), randomUUID()];

      await prisma.scoreConfig.createMany({
        data: configIds.map((id, index) => ({
          id,
          projectId,
          name: `trpc-tie-config-${index}-${id.slice(0, 8)}`,
          description: `trpc tie config ${index}`,
          dataType: ScoreConfigDataType.NUMERIC,
          minValue: index,
          maxValue: index + 1,
          createdAt: sharedCreatedAt,
          updatedAt: sharedCreatedAt,
        })),
      });

      const firstPage = await caller.scoreConfigs.all({
        projectId,
        page: 0,
        limit: 2,
      });
      const secondPage = await caller.scoreConfigs.all({
        projectId,
        page: 1,
        limit: 2,
      });

      const tiedIds = [...firstPage.configs, ...secondPage.configs]
        .filter((config) => configIds.includes(config.id))
        .map((config) => config.id);

      expect(tiedIds).toEqual(configIds.slice().sort());
      expect(new Set(tiedIds).size).toBe(configIds.length);
    });
  });
});
