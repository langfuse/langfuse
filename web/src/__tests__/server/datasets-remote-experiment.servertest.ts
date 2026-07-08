import type { Session } from "next-auth";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

const orgIds: string[] = [];

const prepare = async () => {
  const setup = await createOrgProjectAndApiKey();
  orgIds.push(setup.orgId);

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      name: "Demo User",
      canCreateOrganizations: true,
      organizations: [
        {
          id: setup.orgId,
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: setup.projectId,
              role: "ADMIN",
              name: "Test Project",
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
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  return { caller, projectId: setup.projectId };
};

describe("datasets.upsertRemoteExperiment", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: orgIds },
      },
    });
  });

  it.each([
    {
      url: "not-a-url",
      message: "Invalid URL syntax",
    },
    {
      url: "ftp://example.com/hook",
      message: "Only HTTP and HTTPS protocols are allowed",
    },
    {
      url: "https://127.0.0.1/hook",
      message: "Blocked IP address detected",
    },
  ])(
    "rejects invalid remote experiment URL $url before saving it",
    async ({ url, message }) => {
      const { caller, projectId } = await prepare();
      const datasetId = randomUUID();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          projectId,
          name: `remote-experiment-${datasetId}`,
          remoteExperimentEnabled: false,
        },
      });

      await expect(
        caller.datasets.upsertRemoteExperiment({
          projectId,
          datasetId,
          url,
          defaultPayload: "{}",
          enabled: true,
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining(message),
      });

      const dataset = await prisma.dataset.findUniqueOrThrow({
        where: {
          id_projectId: {
            id: datasetId,
            projectId,
          },
        },
        select: {
          remoteExperimentUrl: true,
          remoteExperimentPayload: true,
          remoteExperimentEnabled: true,
        },
      });

      expect(dataset.remoteExperimentUrl).toBeNull();
      expect(dataset.remoteExperimentPayload).toBeNull();
      expect(dataset.remoteExperimentEnabled).toBe(false);
    },
  );
});
