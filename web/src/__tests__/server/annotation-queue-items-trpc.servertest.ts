import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { AnnotationQueueObjectType, type Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

const HOBBY_LIMIT_MESSAGE =
  /Maximum number of annotation queues reached on Hobby plan/;

describe("annotation queues trpc", () => {
  const orgIds: string[] = [];

  type TestSetup = Awaited<ReturnType<typeof createOrgProjectAndApiKey>>;

  const createCallerForProjectRole = (
    setup: TestSetup,
    projectRole: "ADMIN" | "NONE" = "ADMIN",
    plan: Plan = "cloud:hobby",
  ) => {
    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        name: "Demo User",
        canCreateOrganizations: true,
        admin: false,
        organizations: [
          {
            id: setup.org.id,
            name: setup.org.name,
            role: "MEMBER",
            plan,
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: true,
            projects: [
              {
                id: setup.project.id,
                role: projectRole,
                name: setup.project.name,
                deletedAt: null,
                retentionDays: null,
                hasTraces: false,
                createdAt: new Date().toISOString(),
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: testFeatureFlags(),
      },
      environment: {} as Session["environment"],
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });

    return {
      caller: appRouter.createCaller({ ...ctx, prisma }),
    };
  };

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: {
          in: orgIds,
        },
      },
    });
  });

  const createScoreConfig = (projectId: string) =>
    prisma.scoreConfig.create({
      data: {
        name: `score-${uuidv4().slice(0, 8)}`,
        projectId,
        dataType: "NUMERIC",
      },
    });

  describe("annotationQueueItems.typeById", () => {
    it("requires annotationQueues:read access", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);

      const { caller: adminCaller } = createCallerForProjectRole(
        setup,
        "ADMIN",
      );
      const queue = await prisma.annotationQueue.create({
        data: {
          name: "Test Queue",
          description: "Test Queue Description",
          scoreConfigIds: [],
          projectId: setup.project.id,
        },
      });
      const item = await prisma.annotationQueueItem.create({
        data: {
          queueId: queue.id,
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
          projectId: setup.project.id,
        },
      });

      await expect(
        adminCaller.annotationQueueItems.typeById({
          projectId: setup.project.id,
          queueId: queue.id,
          itemId: item.id,
        }),
      ).resolves.toBe(AnnotationQueueObjectType.TRACE);

      const { caller: limitedCaller } = createCallerForProjectRole(
        setup,
        "NONE",
      );

      await expect(
        limitedCaller.annotationQueueItems.typeById({
          projectId: setup.project.id,
          queueId: queue.id,
          itemId: item.id,
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });
  });

  describe("annotationQueueItems.createMany", () => {
    it.each([false, true])(
      "rejects a queue from another project without writing (isBatchAction: %s)",
      async (isBatchAction) => {
        const setup = await createOrgProjectAndApiKey();
        const otherSetup = await createOrgProjectAndApiKey();
        orgIds.push(setup.org.id, otherSetup.org.id);
        const { caller } = createCallerForProjectRole(setup);
        const otherQueue = await prisma.annotationQueue.create({
          data: {
            name: "Other Queue",
            scoreConfigIds: [],
            projectId: otherSetup.project.id,
          },
        });

        await expect(
          caller.annotationQueueItems.createMany({
            projectId: setup.project.id,
            queueId: otherQueue.id,
            objectIds: [uuidv4()],
            objectType: AnnotationQueueObjectType.TRACE,
            isBatchAction,
            query: isBatchAction ? { filter: [], orderBy: null } : undefined,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });

        expect(
          await prisma.annotationQueueItem.count({
            where: { queueId: otherQueue.id },
          }),
        ).toBe(0);
        expect(
          await prisma.batchAction.count({
            where: { projectId: setup.project.id },
          }),
        ).toBe(0);
      },
    );
  });

  describe("annotationQueues.byObjectId", () => {
    it("ignores items whose project differs from the queue's project", async () => {
      const setup = await createOrgProjectAndApiKey();
      const otherSetup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id, otherSetup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const queue = await prisma.annotationQueue.create({
        data: {
          name: "Test Queue",
          scoreConfigIds: [],
          projectId: setup.project.id,
        },
      });
      const objectId = uuidv4();
      await prisma.annotationQueueItem.create({
        data: {
          queueId: queue.id,
          objectId,
          objectType: AnnotationQueueObjectType.TRACE,
          projectId: otherSetup.project.id,
        },
      });

      await expect(
        caller.annotationQueues.byObjectId({
          projectId: setup.project.id,
          objectId,
          objectType: AnnotationQueueObjectType.TRACE,
        }),
      ).resolves.toEqual({
        queues: [
          {
            id: queue.id,
            name: queue.name,
            itemId: undefined,
            status: undefined,
          },
        ],
        totalCount: 0,
      });
    });
  });

  describe("annotationQueueItems.itemsByQueueId", () => {
    it("returns each item's scores and trace summary", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const projectId = setup.project.id;
      const { caller } = createCallerForProjectRole(setup);

      const qualityConfig = await prisma.scoreConfig.create({
        data: {
          name: `quality-${uuidv4().slice(0, 8)}`,
          projectId,
          dataType: "CATEGORICAL",
          categories: [
            { label: "high", value: 0 },
            { label: "low", value: 1 },
          ],
        },
      });
      const queue = await prisma.annotationQueue.create({
        data: {
          name: `queue-${uuidv4().slice(0, 8)}`,
          scoreConfigIds: [qualityConfig.id],
          projectId,
        },
      });
      const scoredTraceId = uuidv4();
      const unscoredTraceId = uuidv4();
      for (const objectId of [scoredTraceId, unscoredTraceId]) {
        await prisma.annotationQueueItem.create({
          data: {
            queueId: queue.id,
            objectId,
            objectType: AnnotationQueueObjectType.TRACE,
            projectId,
          },
        });
      }

      const traceTimestamp = new Date("2026-03-01T09:30:00.000Z");
      // Write the trace to both stores so the test holds for every write mode.
      await createTracesCh([
        createTrace({
          id: scoredTraceId,
          project_id: projectId,
          user_id: "user-1",
          tags: ["inbound"],
          timestamp: traceTimestamp.getTime(),
        }),
      ]);
      await createEventsCh([
        createEvent({
          project_id: projectId,
          trace_id: scoredTraceId,
          user_id: "user-1",
          tags: ["inbound"],
          start_time: traceTimestamp.getTime(),
        }),
      ]);
      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: scoredTraceId,
          name: qualityConfig.name,
          config_id: qualityConfig.id,
          source: "ANNOTATION",
          data_type: "CATEGORICAL",
          value: 0,
          string_value: "high",
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: scoredTraceId,
          name: qualityConfig.name,
          source: "API",
          data_type: "CATEGORICAL",
          value: 1,
          string_value: "low",
        }),
      ]);

      const result = await caller.annotationQueueItems.itemsByQueueId({
        projectId,
        queueId: queue.id,
        page: 0,
        limit: 100,
      });

      const scoredItem = result.queueItems.find(
        (item) => item.objectId === scoredTraceId,
      );
      const unscoredItem = result.queueItems.find(
        (item) => item.objectId === unscoredTraceId,
      );

      expect(scoredItem?.scores).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "ANNOTATION",
            configId: qualityConfig.id,
            dataType: "CATEGORICAL",
            stringValue: "high",
          }),
          expect.objectContaining({ source: "API", stringValue: "low" }),
        ]),
      );
      expect(scoredItem?.scores).toHaveLength(2);
      expect(scoredItem?.trace).toEqual({
        id: scoredTraceId,
        userId: "user-1",
        tags: ["inbound"],
        timestamp: traceTimestamp,
      });
      expect(unscoredItem?.scores).toEqual([]);
      expect(unscoredItem?.trace).toBeNull();
    });

    it("returns and filters on the queue's trace columns", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const projectId = setup.project.id;
      const { caller } = createCallerForProjectRole(setup);

      const config = await createScoreConfig(projectId);
      const queue = await caller.annotationQueues.create({
        projectId,
        name: `queue-${uuidv4().slice(0, 8)}`,
        scoreConfigIds: [config.id],
        displayColumns: [
          { source: "trace", key: "userId", label: "Phone", format: "phone" },
          {
            source: "metadata",
            key: "location_name",
            label: "Location",
            format: "text",
          },
          { source: "tag", key: "region:", label: "Region", format: "text" },
        ],
      });
      const traces = [
        { id: uuidv4(), location: "Berlin", region: "eu-west" },
        { id: uuidv4(), location: "Paris", region: "eu-north" },
      ];
      for (const [index, trace] of traces.entries()) {
        await prisma.annotationQueueItem.create({
          data: {
            queueId: queue.id,
            objectId: trace.id,
            objectType: AnnotationQueueObjectType.TRACE,
            projectId,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
          },
        });
      }
      // Write the traces to both stores so the test holds for every write mode.
      await createTracesCh(
        traces.map((trace) =>
          createTrace({
            id: trace.id,
            project_id: projectId,
            user_id: "+12025550123",
            tags: [`region:${trace.region}`],
            metadata: { location_name: trace.location },
          }),
        ),
      );
      await createEventsCh(
        traces.map((trace) =>
          createEvent({
            project_id: projectId,
            trace_id: trace.id,
            user_id: "+12025550123",
            tags: [`region:${trace.region}`],
            metadata_names: ["location_name"],
            metadata_values: [trace.location],
          }),
        ),
      );

      const byId = await caller.annotationQueues.byId({
        projectId,
        queueId: queue.id,
      });
      expect(byId.displayColumns.map((column) => column.label)).toEqual([
        "Phone",
        "Location",
        "Region",
      ]);
      const [phone, location, region] = byId.displayColumns;

      const all = await caller.annotationQueueItems.itemsByQueueId({
        projectId,
        queueId: queue.id,
        page: 0,
        limit: 50,
      });
      expect(all.queueItems.map((item) => item.traceFields)).toEqual([
        {
          [phone.id]: "+12025550123",
          [location.id]: "Berlin",
          [region.id]: "eu-west",
        },
        {
          [phone.id]: "+12025550123",
          [location.id]: "Paris",
          [region.id]: "eu-north",
        },
      ]);

      const filtered = await caller.annotationQueueItems.itemsByQueueId({
        projectId,
        queueId: queue.id,
        filter: [
          {
            column: "Location",
            type: "string",
            operator: "contains",
            value: "monica",
          },
        ],
        page: 0,
        limit: 50,
      });
      expect(filtered.queueItems.map((item) => item.objectId)).toEqual([
        traces[1].id,
      ]);
    });

    it("filters on the shown value and paginates the matches", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const projectId = setup.project.id;
      const { caller } = createCallerForProjectRole(setup);

      const qualityConfig = await prisma.scoreConfig.create({
        data: {
          name: `quality-${uuidv4().slice(0, 8)}`,
          projectId,
          dataType: "CATEGORICAL",
          categories: [
            { label: "high", value: 0 },
            { label: "low", value: 1 },
          ],
        },
      });
      const queue = await prisma.annotationQueue.create({
        data: {
          name: `queue-${uuidv4().slice(0, 8)}`,
          scoreConfigIds: [qualityConfig.id],
          projectId,
        },
      });
      // reviewed: API says low, reviewer corrected it to high.
      // pending: only the API value (high), nobody reviewed it yet.
      // low: API low, unreviewed. empty: no score at all.
      const [reviewedId, pendingId, lowId, emptyId] = [
        uuidv4(),
        uuidv4(),
        uuidv4(),
        uuidv4(),
      ];
      for (const [index, objectId] of [
        reviewedId,
        pendingId,
        lowId,
        emptyId,
      ].entries()) {
        await prisma.annotationQueueItem.create({
          data: {
            queueId: queue.id,
            objectId,
            objectType: AnnotationQueueObjectType.TRACE,
            projectId,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
          },
        });
      }
      const qualityScore = (
        traceId: string,
        source: "API" | "ANNOTATION",
        label: "high" | "low",
      ) =>
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          name: qualityConfig.name,
          config_id: qualityConfig.id,
          source,
          data_type: "CATEGORICAL",
          value: label === "high" ? 0 : 1,
          string_value: label,
        });
      await createScoresCh([
        qualityScore(reviewedId, "API", "low"),
        qualityScore(reviewedId, "ANNOTATION", "high"),
        qualityScore(pendingId, "API", "high"),
        qualityScore(lowId, "API", "low"),
      ]);

      const list = (
        filter: Parameters<
          typeof caller.annotationQueueItems.itemsByQueueId
        >[0]["filter"],
        page = 0,
        limit = 50,
      ) =>
        caller.annotationQueueItems.itemsByQueueId({
          projectId,
          queueId: queue.id,
          filter,
          page,
          limit,
        });

      const high = await list([
        {
          column: qualityConfig.name,
          type: "stringOptions",
          operator: "any of",
          value: ["high"],
        },
      ]);
      expect(high.totalItems).toBe(2);
      expect(high.queueItems.map((item) => item.objectId)).toEqual([
        reviewedId,
        pendingId,
      ]);

      const secondPage = await list(
        [
          {
            column: qualityConfig.name,
            type: "stringOptions",
            operator: "any of",
            value: ["high"],
          },
        ],
        1,
        1,
      );
      expect(secondPage.totalItems).toBe(2);
      expect(secondPage.queueItems.map((item) => item.objectId)).toEqual([
        pendingId,
      ]);

      const notHigh = await list([
        {
          column: `scoreConfig-${qualityConfig.id}`,
          type: "stringOptions",
          operator: "none of",
          value: ["high"],
        },
      ]);
      expect(notHigh.queueItems.map((item) => item.objectId)).toEqual([
        lowId,
        emptyId,
      ]);

      const completed = await list([
        {
          column: "Status",
          type: "stringOptions",
          operator: "any of",
          value: ["COMPLETED"],
        },
      ]);
      expect(completed.totalItems).toBe(0);
    });
  });

  describe("annotationQueues.create", () => {
    it("rejects a second queue on cloud:hobby", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const scoreConfig = await createScoreConfig(setup.project.id);

      await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "first-queue",
        scoreConfigIds: [scoreConfig.id],
      });

      await expect(
        caller.annotationQueues.create({
          projectId: setup.project.id,
          name: "second-queue",
          scoreConfigIds: [scoreConfig.id],
        }),
      ).rejects.toThrow(HOBBY_LIMIT_MESSAGE);

      const queueCount = await prisma.annotationQueue.count({
        where: { projectId: setup.project.id },
      });
      expect(queueCount).toBe(1);
    });

    it("does not admit more than one queue on cloud:hobby under concurrent requests", async () => {
      // Counting outside a transaction lets concurrent requests all observe
      // count = 0 and all insert, so the limit only holds if check+create is
      // serialized. Unique names bypass the (projectId, name) unique index.
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const scoreConfig = await createScoreConfig(setup.project.id);

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          caller.annotationQueues.create({
            projectId: setup.project.id,
            name: `hobby-q-${i}`,
            scoreConfigIds: [scoreConfig.id],
          }),
        ),
      );

      const queueCount = await prisma.annotationQueue.count({
        where: { projectId: setup.project.id },
      });
      expect(queueCount).toBe(1);

      const rejected = results.filter((r) => r.status === "rejected");
      expect(results.length - rejected.length).toBe(1);
      for (const result of rejected) {
        // Concurrent losers abort the serializable transaction (P2034) or
        // observe the committed row and hit the hobby limit.
        expect(String(result.reason)).toMatch(
          /Maximum number of annotation queues reached on Hobby plan|Could not create annotation queue, please retry/,
        );
      }
    }, 25_000);

    it("allows more than one queue when the plan is not cloud:hobby", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(
        setup,
        "ADMIN",
        "cloud:pro",
      );
      const scoreConfig = await createScoreConfig(setup.project.id);

      await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "pro-queue-1",
        scoreConfigIds: [scoreConfig.id],
      });
      await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "pro-queue-2",
        scoreConfigIds: [scoreConfig.id],
      });

      const queueCount = await prisma.annotationQueue.count({
        where: { projectId: setup.project.id },
      });
      expect(queueCount).toBe(2);
    });
  });

  describe("annotationQueues.update", () => {
    it("updates queue fields independently without overwriting concurrent settings or config order", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(
        setup,
        "ADMIN",
        "cloud:pro",
      );
      const first = await createScoreConfig(setup.project.id);
      const second = await createScoreConfig(setup.project.id);
      const queue = await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "configured-queue",
        description: "Initial description",
        scoreConfigIds: [first.id, second.id],
      });
      await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "another-queue",
        scoreConfigIds: [first.id],
      });
      await prisma.annotationQueue.update({
        where: { id: queue.id, projectId: setup.project.id },
        data: { name: "Latest name", description: "Latest description" },
      });

      const configured = await caller.annotationQueues.update({
        projectId: setup.project.id,
        queueId: queue.id,
        scoreConfigIds: [second.id, first.id],
      });
      expect(configured).toMatchObject({
        name: "Latest name",
        description: "Latest description",
        scoreConfigIds: [second.id, first.id],
      });

      const settings = await caller.annotationQueues.update({
        projectId: setup.project.id,
        queueId: queue.id,
        name: "Changed settings",
        description: "Changed description",
      });
      expect(settings).toMatchObject({
        name: "Changed settings",
        description: "Changed description",
        scoreConfigIds: [second.id, first.id],
      });
    });

    it("deduplicates resolved queue configs in first-occurrence order", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const first = await createScoreConfig(setup.project.id);
      const second = await createScoreConfig(setup.project.id);
      const queue = await prisma.annotationQueue.create({
        data: {
          projectId: setup.project.id,
          name: "legacy-queue-configs",
          scoreConfigIds: [second.id, uuidv4(), second.id, first.id, first.id],
        },
      });

      const [details, list] = await Promise.all([
        caller.annotationQueues.byId({
          projectId: setup.project.id,
          queueId: queue.id,
        }),
        caller.annotationQueues.all({ projectId: setup.project.id }),
      ]);
      expect(details.scoreConfigs.map((config) => config.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(
        list.queues
          .find((entry) => entry.id === queue.id)
          ?.scoreConfigs.map((config) => config.id),
      ).toEqual([second.id, first.id]);
    });

    it("persists score config order through queue reads without changing completed items", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(
        setup,
        "ADMIN",
        "cloud:pro",
      );
      const first = await createScoreConfig(setup.project.id);
      const second = await createScoreConfig(setup.project.id);
      const queue = await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "ordered-queue",
        scoreConfigIds: [second.id, first.id],
      });
      const completedAt = new Date();
      const item = await prisma.annotationQueueItem.create({
        data: {
          queueId: queue.id,
          projectId: setup.project.id,
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
          status: "COMPLETED",
          completedAt,
        },
      });

      const assertQueueOrder = async (expected: string[]) => {
        const details = await caller.annotationQueues.byId({
          projectId: setup.project.id,
          queueId: queue.id,
        });
        expect(details.scoreConfigIds).toEqual(expected);
        expect(details.scoreConfigs.map((config) => config.id)).toEqual(
          expected,
        );
        const list = await caller.annotationQueues.all({
          projectId: setup.project.id,
        });
        expect(
          list.queues
            .find((entry) => entry.id === queue.id)
            ?.scoreConfigs.map((config) => config.id),
        ).toEqual(expected);
      };

      await assertQueueOrder([second.id, first.id]);
      await caller.annotationQueues.update({
        projectId: setup.project.id,
        queueId: queue.id,
        name: queue.name,
        scoreConfigIds: [first.id, second.id],
      });
      await assertQueueOrder([first.id, second.id]);
      expect(
        await prisma.annotationQueueItem.findUnique({
          where: { id: item.id },
          select: { status: true, completedAt: true },
        }),
      ).toEqual({ status: "COMPLETED", completedAt });
    });

    it("rejects a rename that collides with another queue in the project", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(
        setup,
        "ADMIN",
        "cloud:pro",
      );
      const scoreConfig = await createScoreConfig(setup.project.id);

      const first = await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "queue-alpha",
        scoreConfigIds: [scoreConfig.id],
      });
      await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "queue-beta",
        scoreConfigIds: [scoreConfig.id],
      });

      await expect(
        caller.annotationQueues.update({
          projectId: setup.project.id,
          queueId: first.id,
          name: "queue-beta",
          scoreConfigIds: [scoreConfig.id],
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "A queue with this name already exists in the project",
      });
    });

    it("returns not found when the queue does not exist in the project", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const scoreConfig = await createScoreConfig(setup.project.id);

      await expect(
        caller.annotationQueues.update({
          projectId: setup.project.id,
          queueId: uuidv4(),
          name: "missing-queue",
          scoreConfigIds: [scoreConfig.id],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe.each(["create", "update"] as const)(
    "annotationQueues.%s score config validation",
    (operation) => {
      it.each(["empty", "duplicate", "other-project"] as const)(
        "rejects %s score config IDs without changing the queue",
        async (invalidSelection) => {
          const setup = await createOrgProjectAndApiKey();
          const otherSetup = await createOrgProjectAndApiKey();
          orgIds.push(setup.org.id, otherSetup.org.id);
          const { caller } = createCallerForProjectRole(
            setup,
            "ADMIN",
            "cloud:pro",
          );
          const config = await createScoreConfig(setup.project.id);
          const otherConfig = await createScoreConfig(otherSetup.project.id);
          const queue = await caller.annotationQueues.create({
            projectId: setup.project.id,
            name: "existing-queue",
            scoreConfigIds: [config.id],
          });
          const invalidIds = {
            empty: [],
            duplicate: [config.id, config.id],
            "other-project": [config.id, otherConfig.id],
          };
          const scoreConfigIds = invalidIds[invalidSelection];
          const input = {
            projectId: setup.project.id,
            name: "changed-queue",
            scoreConfigIds,
          };

          await expect(
            operation === "create"
              ? caller.annotationQueues.create(input)
              : caller.annotationQueues.update({
                  projectId: setup.project.id,
                  queueId: queue.id,
                  scoreConfigIds,
                }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          expect(
            await prisma.annotationQueue.findMany({
              where: { projectId: setup.project.id },
              select: { id: true, name: true, scoreConfigIds: true },
            }),
          ).toEqual([
            {
              id: queue.id,
              name: queue.name,
              scoreConfigIds: [config.id],
            },
          ]);
        },
      );
    },
  );

  describe("annotationQueues.delete", () => {
    it("returns not found when the queue does not exist in the project", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);

      await expect(
        caller.annotationQueues.delete({
          projectId: setup.project.id,
          queueId: uuidv4(),
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Queue not found in project",
      });
    });

    it("deletes an existing queue", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const scoreConfig = await createScoreConfig(setup.project.id);

      const queue = await caller.annotationQueues.create({
        projectId: setup.project.id,
        name: "queue-to-delete",
        scoreConfigIds: [scoreConfig.id],
      });

      await expect(
        caller.annotationQueues.delete({
          projectId: setup.project.id,
          queueId: queue.id,
        }),
      ).resolves.toMatchObject({ id: queue.id });

      const remaining = await prisma.annotationQueue.findUnique({
        where: { id: queue.id },
      });
      expect(remaining).toBeNull();
    });
  });
});
