import type { Session } from "next-auth";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";
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
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: setup.projectId,
              role: "ADMIN",
              name: "Test Project",
              deletedAt: null,
              retentionDays: null,
              hasTraces: false,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        searchBar: false,
        templateFlag: true,
        excludeClickhouseRead: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
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

describe("remote experiment auth headers and signing secret", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: orgIds },
      },
    });
  });

  const createDataset = async (projectId: string) => {
    const datasetId = randomUUID();
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: `remote-experiment-${datasetId}`,
      },
    });
    return datasetId;
  };

  const selectSecretColumns = (datasetId: string, projectId: string) =>
    prisma.dataset.findUniqueOrThrow({
      where: { id_projectId: { id: datasetId, projectId } },
      select: {
        remoteExperimentSecretKey: true,
        remoteExperimentDisplaySecretKey: true,
        remoteExperimentRequestHeaders: true,
        remoteExperimentDisplayHeaders: true,
      },
    });

  it("generates a signing secret on first upsert, returns it once, and stores it encrypted", async () => {
    const { caller, projectId } = await prepare();
    const datasetId = await createDataset(projectId);

    const first = await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook",
      defaultPayload: "{}",
      enabled: true,
    });

    expect(first.unencryptedSecretKey).toMatch(/^lf-whsec_[a-f0-9]{64}$/);

    const stored = await selectSecretColumns(datasetId, projectId);
    expect(stored.remoteExperimentSecretKey).not.toBe(
      first.unencryptedSecretKey,
    );
    expect(decrypt(stored.remoteExperimentSecretKey!)).toBe(
      first.unencryptedSecretKey,
    );
    expect(stored.remoteExperimentDisplaySecretKey).toBe(
      `lf-whsec_...${first.unencryptedSecretKey!.slice(-4)}`,
    );

    // Second upsert keeps the secret and does not return it again
    const second = await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook-updated",
      defaultPayload: "{}",
      enabled: true,
    });

    expect(second.unencryptedSecretKey).toBeUndefined();
    const storedAfter = await selectSecretColumns(datasetId, projectId);
    expect(storedAfter.remoteExperimentSecretKey).toBe(
      stored.remoteExperimentSecretKey,
    );
  });

  it("does not create or retain a signing secret when signing is disabled", async () => {
    const { caller, projectId } = await prepare();
    const datasetId = await createDataset(projectId);

    await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook",
      defaultPayload: "{}",
      enabled: true,
      signingEnabled: true,
    });

    const first = await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook",
      defaultPayload: "{}",
      enabled: true,
      signingEnabled: false,
    });

    expect(first.unencryptedSecretKey).toBeUndefined();
    const stored = await selectSecretColumns(datasetId, projectId);
    expect(stored.remoteExperimentSecretKey).toBeNull();
    expect(stored.remoteExperimentDisplaySecretKey).toBeNull();
  });

  it("stores secret headers encrypted and only exposes masked display values", async () => {
    const { caller, projectId } = await prepare();
    const datasetId = await createDataset(projectId);

    await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook",
      defaultPayload: "{}",
      enabled: true,
      requestHeaders: {
        authorization: { secret: true, value: "Bearer token-123" },
        "x-environment": { secret: false, value: "production" },
      },
    });

    const stored = await selectSecretColumns(datasetId, projectId);
    const storedHeaders = stored.remoteExperimentRequestHeaders as Record<
      string,
      { secret: boolean; value: string }
    >;
    expect(storedHeaders.authorization.value).not.toBe("Bearer token-123");
    expect(decrypt(storedHeaders.authorization.value)).toBe("Bearer token-123");
    expect(storedHeaders["x-environment"].value).toBe("production");

    const config = await caller.datasets.getRemoteExperiment({
      projectId,
      datasetId,
    });
    expect(config?.displayHeaders).toEqual({
      authorization: { secret: true, value: "Bear...-123" },
      "x-environment": { secret: false, value: "production" },
    });
    expect(config?.displaySecretKey).toMatch(/^lf-whsec_\.\.\./);
    // The plaintext secret must not appear anywhere in the safe read
    expect(JSON.stringify(config)).not.toContain("token-123");

    // URL-only update (no requestHeaders) preserves the headers
    await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook-updated",
      defaultPayload: "{}",
      enabled: true,
    });
    const preserved = await selectSecretColumns(datasetId, projectId);
    expect(preserved.remoteExperimentRequestHeaders).toEqual(storedHeaders);
  });

  it("excludes secret columns from generic dataset reads via the global Prisma omit", async () => {
    const { caller, projectId } = await prepare();
    const datasetId = await createDataset(projectId);

    await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook",
      defaultPayload: "{}",
      enabled: true,
      requestHeaders: {
        authorization: { secret: true, value: "Bearer token-123" },
      },
    });

    const dataset = await caller.datasets.byId({ projectId, datasetId });
    expect(dataset).not.toBeNull();
    expect(dataset).not.toHaveProperty("remoteExperimentSecretKey");
    expect(dataset).not.toHaveProperty("remoteExperimentRequestHeaders");

    // Same holds for a raw Prisma read without a select
    const rawRead = await prisma.dataset.findUniqueOrThrow({
      where: { id_projectId: { id: datasetId, projectId } },
    });
    expect(rawRead).not.toHaveProperty("remoteExperimentSecretKey");
    expect(rawRead).not.toHaveProperty("remoteExperimentRequestHeaders");
  });

  it("rejects protected headers", async () => {
    const { caller, projectId } = await prepare();
    const datasetId = await createDataset(projectId);

    await expect(
      caller.datasets.upsertRemoteExperiment({
        projectId,
        datasetId,
        url: "https://example.com/hook",
        defaultPayload: "{}",
        enabled: true,
        requestHeaders: {
          "Content-Type": { secret: false, value: "text/plain" },
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("cannot be overridden"),
    });
  });

  it("clears secret and header columns on delete", async () => {
    const { caller, projectId } = await prepare();
    const datasetId = await createDataset(projectId);

    await caller.datasets.upsertRemoteExperiment({
      projectId,
      datasetId,
      url: "https://example.com/hook",
      defaultPayload: "{}",
      enabled: true,
      requestHeaders: {
        authorization: { secret: true, value: "Bearer token-123" },
      },
    });

    await caller.datasets.deleteRemoteExperiment({ projectId, datasetId });

    const stored = await selectSecretColumns(datasetId, projectId);
    expect(stored.remoteExperimentSecretKey).toBeNull();
    expect(stored.remoteExperimentDisplaySecretKey).toBeNull();
    expect(stored.remoteExperimentRequestHeaders).toBeNull();
    expect(stored.remoteExperimentDisplayHeaders).toBeNull();
  });
});
