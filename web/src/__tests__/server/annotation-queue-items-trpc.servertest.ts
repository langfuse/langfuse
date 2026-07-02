import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

describe("annotationQueueItems trpc", () => {
  const orgIds: string[] = [];

  type TestSetup = Awaited<ReturnType<typeof createOrgProjectAndApiKey>>;

  const createCallerForProjectRole = (
    setup: TestSetup,
    projectRole: "ADMIN" | "NONE" = "ADMIN",
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
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            projects: [
              {
                id: setup.project.id,
                role: projectRole,
                name: setup.project.name,
                deletedAt: null,
                retentionDays: null,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          templateFlag: true,
          excludeClickhouseRead: false,
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

  describe("typeById", () => {
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

  describe("fetchAndLockNext", () => {
    it("processes pending queue items in the requested order", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);

      const { caller } = createCallerForProjectRole(setup);
      const queue = await prisma.annotationQueue.create({
        data: {
          name: "Ordered Queue",
          scoreConfigIds: [],
          projectId: setup.project.id,
        },
      });

      const oldestItemId = uuidv4();
      const newestItemId = uuidv4();
      const completedItemId = uuidv4();
      const lockedItemId = uuidv4();

      await prisma.annotationQueueItem.createMany({
        data: [
          {
            id: oldestItemId,
            queueId: queue.id,
            objectId: uuidv4(),
            objectType: AnnotationQueueObjectType.TRACE,
            projectId: setup.project.id,
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          },
          {
            id: newestItemId,
            queueId: queue.id,
            objectId: uuidv4(),
            objectType: AnnotationQueueObjectType.TRACE,
            projectId: setup.project.id,
            createdAt: new Date("2025-01-02T00:00:00.000Z"),
          },
          {
            id: completedItemId,
            queueId: queue.id,
            objectId: uuidv4(),
            objectType: AnnotationQueueObjectType.TRACE,
            status: AnnotationQueueStatus.COMPLETED,
            projectId: setup.project.id,
            createdAt: new Date("2025-01-03T00:00:00.000Z"),
          },
          {
            id: lockedItemId,
            queueId: queue.id,
            objectId: uuidv4(),
            objectType: AnnotationQueueObjectType.TRACE,
            projectId: setup.project.id,
            createdAt: new Date("2025-01-04T00:00:00.000Z"),
            lockedAt: new Date(),
          },
        ],
      });

      await expect(
        caller.annotationQueues.fetchAndLockNext({
          queueId: queue.id,
          projectId: setup.project.id,
          seenItemIds: [],
        }),
      ).resolves.toMatchObject({ id: oldestItemId });

      await expect(
        caller.annotationQueues.fetchAndLockNext({
          queueId: queue.id,
          projectId: setup.project.id,
          seenItemIds: [],
          order: "asc",
        }),
      ).resolves.toMatchObject({ id: oldestItemId });

      await expect(
        caller.annotationQueues.fetchAndLockNext({
          queueId: queue.id,
          projectId: setup.project.id,
          seenItemIds: [],
          order: "desc",
        }),
      ).resolves.toMatchObject({ id: newestItemId });
    });

    it("uses the item id to break equal created-at timestamps", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);

      const { caller } = createCallerForProjectRole(setup);
      const queue = await prisma.annotationQueue.create({
        data: {
          name: "Tie Breaker Queue",
          scoreConfigIds: [],
          projectId: setup.project.id,
        },
      });
      const createdAt = new Date("2025-01-01T00:00:00.000Z");
      const itemIdPrefix = uuidv4().slice(0, 8);
      const lowerItemId = `${itemIdPrefix}-0000-0000-0000-000000000001`;
      const higherItemId = `${itemIdPrefix}-0000-0000-0000-000000000002`;

      await prisma.annotationQueueItem.createMany({
        data: [lowerItemId, higherItemId].map((id) => ({
          id,
          queueId: queue.id,
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
          projectId: setup.project.id,
          createdAt,
        })),
      });

      await expect(
        caller.annotationQueues.fetchAndLockNext({
          queueId: queue.id,
          projectId: setup.project.id,
          seenItemIds: [],
          order: "asc",
        }),
      ).resolves.toMatchObject({ id: lowerItemId });

      await expect(
        caller.annotationQueues.fetchAndLockNext({
          queueId: queue.id,
          projectId: setup.project.id,
          seenItemIds: [],
          order: "desc",
        }),
      ).resolves.toMatchObject({ id: higherItemId });
    });
  });
});
