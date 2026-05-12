import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const orgIds: string[] = [];

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
          aiFeaturesEnabled: false,
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  orgIds.push(org.id);

  return { project, caller };
}

describe("datasets trpc", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: orgIds },
      },
    });
  });

  describe("datasets.triggerRemoteExperiment", () => {
    it("should execute remote experiments through the secure webhook fetch helper", async () => {
      const { project, caller } = await prepare();
      const datasetId = v4();
      const remoteExperimentUrl = "https://example.com/remote-run";

      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: "remote-experiment-dataset",
          projectId: project.id,
          remoteExperimentUrl,
          remoteExperimentPayload: { default: true },
          remoteExperimentEnabled: true,
        },
      });

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await caller.datasets.triggerRemoteExperiment({
        projectId: project.id,
        datasetId,
        payload: "custom-payload",
      });

      expect(result).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledWith(
        remoteExperimentUrl,
        expect.objectContaining({
          method: "POST",
          redirect: "manual",
        }),
      );

      const requestOptions = fetchMock.mock.calls[0]?.[1] as
        | RequestInit
        | undefined;

      expect(new Headers(requestOptions?.headers).get("content-type")).toBe(
        "application/json",
      );
      expect(JSON.parse(String(requestOptions?.body))).toEqual({
        projectId: project.id,
        datasetId,
        datasetName: "remote-experiment-dataset",
        payload: "custom-payload",
      });
    });
  });
});
