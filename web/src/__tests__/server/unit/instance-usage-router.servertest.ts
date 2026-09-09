import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { Role } from "@langfuse/shared/src/db";
import type * as SharedServer from "@langfuse/shared/src/server";

type SessionOrganization = NonNullable<
  Session["user"]
>["organizations"][number];

const { queryClickhouseMock } = vi.hoisted(() => ({
  queryClickhouseMock: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  queryClickhouse: queryClickhouseMock,
}));

const { instanceUsageRouter } =
  await import("@/src/features/instance-usage/server/instanceUsageRouter");

const buildSession = ({
  role,
  admin = false,
}: {
  role?: Role;
  admin?: boolean;
}): Session => ({
  expires: "1",
  user: {
    id: `instance-usage-user-${randomUUID()}`,
    canCreateOrganizations: true,
    name: "Instance Usage Test User",
    organizations: role
      ? [
          {
            id: "org-1",
            name: "Org 1",
            role,
            projects: [],
            metadata: {},
          } as unknown as SessionOrganization,
        ]
      : [],
    featureFlags: {
      searchBar: false,
      excludeClickhouseRead: false,
      templateFlag: true,
      v4BetaToggleVisible: false,
      observationEvals: false,
      experimentsV4Enabled: false,
    },
    admin,
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: "oss",
  },
});

const createCaller = (session: Session) => {
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return instanceUsageRouter.createCaller({
    ...ctx,
    prisma: {
      organization: { count: async () => 3 },
      project: { count: async () => 5 },
      user: { count: async () => 9 },
      $queryRaw: async () => [{ size: BigInt(4096) }],
    } as unknown as typeof ctx.prisma,
  });
};

describe("instanceUsage.get", () => {
  const envRecord = env as unknown as Record<string, string | undefined>;
  const originalCloudRegion = envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalWriteMode = envRecord.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  const originalPreviewPrUrl = envRecord.NEXT_PUBLIC_PREVIEW_PR_URL;

  beforeEach(() => {
    // The page is self-host only; the local dev .env marks the test process as
    // cloud ("DEV"), which would trip the cloud guard.
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    envRecord.NEXT_PUBLIC_PREVIEW_PR_URL = undefined;
    envRecord.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
    queryClickhouseMock.mockReset();
    queryClickhouseMock.mockResolvedValue([]);
  });

  afterEach(() => {
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    envRecord.NEXT_PUBLIC_PREVIEW_PR_URL = originalPreviewPrUrl;
    envRecord.LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
  });

  it("rejects the request on Langfuse Cloud", async () => {
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    const caller = createCaller(buildSession({ role: Role.OWNER }));

    await expect(caller.get()).rejects.toThrow(
      /not available in Langfuse Cloud/,
    );
  });

  it("serves PR previews, which build with the DEV cloud region", async () => {
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    envRecord.NEXT_PUBLIC_PREVIEW_PR_URL =
      "https://github.com/langfuse/langfuse/pull/1";
    const caller = createCaller(buildSession({ role: Role.OWNER }));

    await expect(caller.get()).resolves.toMatchObject({
      instance: { organizations: 3 },
    });
  });

  it("still rejects a real Cloud region that carries a stray preview URL", async () => {
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    envRecord.NEXT_PUBLIC_PREVIEW_PR_URL =
      "https://github.com/langfuse/langfuse/pull/1";
    const caller = createCaller(buildSession({ role: Role.OWNER }));

    await expect(caller.get()).rejects.toThrow(
      /not available in Langfuse Cloud/,
    );
  });

  it("rejects the DEV region outside a preview, ie local dev pointed at cloud config", async () => {
    envRecord.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    const caller = createCaller(buildSession({ role: Role.OWNER }));

    await expect(caller.get()).rejects.toThrow(
      /not available in Langfuse Cloud/,
    );
  });

  it("rejects members and viewers, who should not see instance-wide numbers", async () => {
    for (const role of [Role.MEMBER, Role.VIEWER]) {
      const caller = createCaller(buildSession({ role }));
      await expect(caller.get()).rejects.toThrow(/Owner or Admin role/);
    }
  });

  it.each([Role.OWNER, Role.ADMIN])("allows org-level %s", async (role) => {
    const caller = createCaller(buildSession({ role }));
    await expect(caller.get()).resolves.toMatchObject({
      instance: { organizations: 3, projects: 5, users: 9 },
    });
  });

  it("allows a Langfuse admin without any org membership", async () => {
    const caller = createCaller(buildSession({ admin: true }));

    await expect(caller.get()).resolves.toMatchObject({
      instance: { postgresBytes: 4096 },
    });
  });

  it("turns partition rows into the monthly pivot", async () => {
    queryClickhouseMock.mockResolvedValue([
      {
        table: "traces",
        partition_id: "202607",
        rows: "10",
        bytes_on_disk: "100",
        data_uncompressed_bytes: "900",
        part_count: "2",
      },
      {
        table: "observations",
        partition_id: "202607",
        rows: "40",
        bytes_on_disk: "400",
        data_uncompressed_bytes: "3600",
        part_count: "3",
      },
    ]);

    const result = await createCaller(buildSession({ role: Role.OWNER })).get();

    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2026-07",
        tracingUnits: 50,
        onDiskBytes: 500,
        counts: { traces: 10, observations: 40, scores: 0 },
      }),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("degrades to an empty table with a warning when system.parts is unreadable", async () => {
    queryClickhouseMock.mockRejectedValue(new Error("access denied"));

    const result = await createCaller(buildSession({ role: Role.OWNER })).get();

    expect(result.months).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/system\.parts/);
  });
});
