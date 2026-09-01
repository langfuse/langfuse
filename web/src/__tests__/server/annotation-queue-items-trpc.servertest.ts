import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { AnnotationQueueObjectType } from "@langfuse/shared";
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

  describe("createMany", () => {
    it("dedupes objects already queued, including duplicates within one call", async () => {
      const setup = await createOrgProjectAndApiKey();
      orgIds.push(setup.org.id);
      const { caller } = createCallerForProjectRole(setup, "ADMIN");

      const queue = await prisma.annotationQueue.create({
        data: {
          name: "Test Queue",
          description: "Test Queue Description",
          scoreConfigIds: [],
          projectId: setup.project.id,
        },
      });

      const alreadyQueuedObjectId = uuidv4();
      await prisma.annotationQueueItem.create({
        data: {
          queueId: queue.id,
          objectId: alreadyQueuedObjectId,
          objectType: AnnotationQueueObjectType.TRACE,
          projectId: setup.project.id,
        },
      });

      const newObjectId = uuidv4();

      const result = await caller.annotationQueueItems.createMany({
        projectId: setup.project.id,
        queueId: queue.id,
        // newObjectId listed twice to also exercise in-batch dedup
        objectIds: [alreadyQueuedObjectId, newObjectId, newObjectId],
        objectType: AnnotationQueueObjectType.TRACE,
      });

      expect(result.createdCount).toBe(1);

      const items = await prisma.annotationQueueItem.findMany({
        where: {
          queueId: queue.id,
          objectType: AnnotationQueueObjectType.TRACE,
          objectId: { in: [alreadyQueuedObjectId, newObjectId] },
        },
      });
      expect(items).toHaveLength(2);
      expect(
        items.filter((item) => item.objectId === newObjectId),
      ).toHaveLength(1);
    });
  });
});
