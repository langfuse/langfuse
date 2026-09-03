import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { AnnotationQueueObjectType, type Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
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
        featureFlags: {
          templateFlag: true,
          excludeClickhouseRead: false,
          experimentsV4Enabled: false,
          observationEvals: false,
          searchBar: false,
          v4BetaToggleVisible: false,
        },
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
});
