import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import superjson from "superjson";
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

  describe("datasets JSON prototype pollution guards", () => {
    it("rejects dangerous keys in dataset metadata", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.datasets.createDataset({
          projectId: project.id,
          name: `dangerous-metadata-${v4()}`,
          metadata: JSON.stringify({
            safe: true,
            nested: JSON.parse('{"prototype":"polluted"}') as unknown,
          }),
        }),
      ).rejects.toThrow(
        /Dataset metadata contains unsupported key at nested\.prototype/,
      );
    });

    it("rejects dangerous keys in dataset schemas", async () => {
      const { project, caller } = await prepare();

      await expect(
        caller.datasets.createDataset({
          projectId: project.id,
          name: `dangerous-schema-${v4()}`,
          inputSchema: {
            type: "object",
            properties: JSON.parse('{"prototype":{"type":"string"}}') as Record<
              string,
              unknown
            >,
          },
        }),
      ).rejects.toThrow(
        /Dataset inputSchema contains unsupported key at properties\.prototype/,
      );
    });

    it("strips dangerous keys from existing rows before allDatasets is serialized", async () => {
      const { project, caller } = await prepare();
      const datasetId = v4();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          projectId: project.id,
          name: `legacy-dangerous-row-${datasetId}`,
          metadata: JSON.parse(
            '{"safe":true,"nested":{"prototype":"polluted"}}',
          ),
          inputSchema: {
            type: "object",
            properties: JSON.parse(
              '{"safe":{"type":"string"},"prototype":{"type":"string"}}',
            ),
          },
        },
      });

      const result = await caller.datasets.allDatasets({
        projectId: project.id,
        searchQuery: "legacy-dangerous-row",
        pathPrefix: "",
        page: 0,
        limit: 50,
      });

      expect(() => superjson.serialize(result)).not.toThrow();
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0]?.metadata).toEqual({
        safe: true,
        nested: {},
      });
      expect(result.datasets[0]?.inputSchema).toEqual({
        type: "object",
        properties: {
          safe: { type: "string" },
        },
      });
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
