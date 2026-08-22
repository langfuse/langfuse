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

  describe("itemsByQueueId", () => {
    const createQueueWithItems = async (projectId: string) => {
      const queue = await prisma.annotationQueue.create({
        data: {
          name: "Test Queue",
          description: "Test Queue Description",
          scoreConfigIds: [],
          projectId,
        },
      });

      const baseTime = new Date("2026-01-01T00:00:00.000Z");
      const items = [];
      for (const offset of [0, 1, 2]) {
        items.push(
          await prisma.annotationQueueItem.create({
            data: {
              queueId: queue.id,
              objectId: uuidv4(),
              objectType: AnnotationQueueObjectType.TRACE,
              projectId,
              createdAt: new Date(baseTime.getTime() + offset * 60_000),
            },
          }),
        );
      }

      return { queue, items };
    };

    it("keeps the default createdAt ascending order when no orderBy is given", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const { queue, items } = await createQueueWithItems(setup.project.id);

      const { queueItems, totalItems } =
        await caller.annotationQueueItems.itemsByQueueId({
          projectId: setup.project.id,
          queueId: queue.id,
          page: 0,
          limit: 10,
        });

      expect(queueItems.map((item) => item.id)).toEqual([
        items[0].id,
        items[1].id,
        items[2].id,
      ]);
      expect(totalItems).toBe(3);
    });

    it("returns createdAt and supports ordering items by createdAt", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const { queue, items } = await createQueueWithItems(setup.project.id);

      const { queueItems } = await caller.annotationQueueItems.itemsByQueueId({
        projectId: setup.project.id,
        queueId: queue.id,
        page: 0,
        limit: 10,
        orderBy: { column: "createdAt", order: "DESC" },
      });

      expect(queueItems.map((item) => item.id)).toEqual([
        items[2].id,
        items[1].id,
        items[0].id,
      ]);
      expect(queueItems[0].createdAt).toEqual(items[2].createdAt);
    });

    it("supports filtering items by status", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const { queue, items } = await createQueueWithItems(setup.project.id);

      await prisma.annotationQueueItem.update({
        where: { id: items[1].id },
        data: {
          status: AnnotationQueueStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      const { queueItems, totalItems } =
        await caller.annotationQueueItems.itemsByQueueId({
          projectId: setup.project.id,
          queueId: queue.id,
          page: 0,
          limit: 10,
          filter: [
            {
              column: "status",
              type: "stringOptions",
              operator: "any of",
              value: [AnnotationQueueStatus.COMPLETED],
            },
          ],
        });

      expect(queueItems.map((item) => item.id)).toEqual([items[1].id]);
      expect(totalItems).toBe(1);
    });

    it("supports datetime filters and sorting by completedAt", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup);
      const { queue, items } = await createQueueWithItems(setup.project.id);

      await prisma.annotationQueueItem.update({
        where: { id: items[0].id },
        data: {
          status: AnnotationQueueStatus.COMPLETED,
          completedAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      });
      await prisma.annotationQueueItem.update({
        where: { id: items[1].id },
        data: {
          status: AnnotationQueueStatus.COMPLETED,
          completedAt: new Date("2026-02-02T00:00:00.000Z"),
        },
      });

      const { queueItems, totalItems } =
        await caller.annotationQueueItems.itemsByQueueId({
          projectId: setup.project.id,
          queueId: queue.id,
          page: 0,
          limit: 10,
          filter: [
            {
              column: "createdAt",
              type: "datetime",
              operator: ">=",
              value: new Date("2026-01-01T00:01:30.000Z"),
            },
          ],
        });

      expect(queueItems.map((item) => item.id)).toEqual([items[2].id]);
      expect(totalItems).toBe(1);

      const sorted = await caller.annotationQueueItems.itemsByQueueId({
        projectId: setup.project.id,
        queueId: queue.id,
        page: 0,
        limit: 10,
        orderBy: { column: "completedAt", order: "DESC" },
      });

      // completedAt is nullable, so DESC puts pending items last
      expect(sorted.queueItems.map((item) => item.id)).toEqual([
        items[1].id,
        items[0].id,
        items[2].id,
      ]);
    });
  });
});
