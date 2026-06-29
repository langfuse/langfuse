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
});
