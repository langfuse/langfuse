/**
 * Contract tests for dashboard.executeQuery's `version` input:
 * - `version` is required — there is no implicit v1 default a client can
 *   fall into while its session is still resolving.
 * - Both versions serve regardless of the USER's read path: saved v1 widgets
 *   render for v4 users, and monitors previews / shared v2 widgets query v2
 *   for users whose own read path is still v3. Only a legacy deployment
 *   (events tables not written) rejects v2 — not covered here because the
 *   test env boots in dual mode.
 */
import { type QueryType } from "@langfuse/shared/query";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Session } from "next-auth";

describe("dashboard.executeQuery version contract", () => {
  let projectId: string;
  let orgId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    orgId = org.orgId;
  });

  function makeCaller(options: { v4BetaEnabled: boolean }) {
    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Test User",
        v4BetaEnabled: options.v4BetaEnabled,
        organizations: [
          {
            id: orgId,
            name: "Test Organization",
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: true,
            projects: [
              {
                id: projectId,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: "Test Project",
                hasTraces: true,
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
          v4BetaToggleVisible: false,
          observationEvals: false,
          experimentsV4Enabled: false,
          searchBar: false,
        },
        admin: false,
      },
      environment: {} as any,
    };
    const ctx = createInnerTRPCContext({ session, headers: {} });
    return appRouter.createCaller({ ...ctx, prisma });
  }

  const query: QueryType = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [],
    timeDimension: null,
    fromTimestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    toTimestamp: new Date().toISOString(),
    orderBy: null,
  };

  it("rejects a missing version instead of defaulting to v1", async () => {
    const caller = makeCaller({ v4BetaEnabled: true });
    await expect(
      caller.dashboard.executeQuery({ projectId, query } as any),
    ).rejects.toThrow();
  });

  it("serves v1 and v2 to a v4 session (saved v1 widgets still render)", async () => {
    const caller = makeCaller({ v4BetaEnabled: true });
    await expect(
      caller.dashboard.executeQuery({ projectId, query, version: "v1" }),
    ).resolves.toBeDefined();
    await expect(
      caller.dashboard.executeQuery({ projectId, query, version: "v2" }),
    ).resolves.toBeDefined();
  });

  it("serves v2 to a v3-read-path session (monitors previews, shared v2 widgets)", async () => {
    const caller = makeCaller({ v4BetaEnabled: false });
    await expect(
      caller.dashboard.executeQuery({ projectId, query, version: "v2" }),
    ).resolves.toBeDefined();
  });
});
