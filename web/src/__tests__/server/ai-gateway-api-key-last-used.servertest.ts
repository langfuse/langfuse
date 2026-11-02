import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { afterEach, describe, expect, it } from "vitest";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { AI_GATEWAY_SERVICE_NAME } from "@langfuse/shared";
import { prisma, Role } from "@langfuse/shared/src/db";
import { createEvent, createEventsCh } from "@langfuse/shared/src/server";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const cleanupOrganizations: string[] = [];
const cleanupUsers: string[] = [];
const originalGatewayOrganizationAllowlist = [
  ...env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST,
];
const originalDeploymentEnv = {
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  LANGFUSE_AI_GATEWAY_DEPLOYED: env.LANGFUSE_AI_GATEWAY_DEPLOYED,
};

afterEach(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: cleanupOrganizations.splice(0) } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: cleanupUsers.splice(0) } },
  });
  env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.splice(
    0,
    env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.length,
    ...originalGatewayOrganizationAllowlist,
  );
  Object.assign(env, originalDeploymentEnv);
});

async function prepareOrganization() {
  const suffix = randomUUID();
  const org = await prisma.organization.create({
    data: { name: `Gateway last used ${suffix}` },
  });
  cleanupOrganizations.push(org.id);
  env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.push(org.id);
  const [ingestionProject, otherProject] = await Promise.all([
    prisma.project.create({ data: { name: "Ingestion", orgId: org.id } }),
    prisma.project.create({ data: { name: "Other", orgId: org.id } }),
  ]);
  return { org, ingestionProject, otherProject };
}

async function callerFor(
  org: { id: string; name: string },
  role: Role,
): Promise<ReturnType<typeof appRouter.createCaller>> {
  const user = await prisma.user.create({
    data: {
      email: `gateway-last-used-${randomUUID()}@example.test`,
      name: `Gateway ${role.toLowerCase()}`,
    },
  });
  cleanupUsers.push(user.id);
  await prisma.organizationMembership.create({
    data: { orgId: org.id, userId: user.id, role },
  });
  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      name: user.name,
      canCreateOrganizations: true,
      featureFlags: testFeatureFlags({ templateFlag: false }),
      organizations: [
        {
          id: org.id,
          name: org.name,
          role,
          cloudConfig: undefined,
          plan: "oss",
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [],
        },
      ],
    },
    environment: {} as Session["environment"],
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

function gatewayRequest(params: {
  projectId: string;
  apiKeyId: string;
  at: Date;
  serviceName?: string;
}) {
  const id = randomUUID();
  return createEvent({
    id,
    span_id: id,
    trace_id: randomUUID(),
    project_id: params.projectId,
    type: "GENERATION",
    start_time: params.at.getTime() * 1000,
    ingestion_api_key: params.apiKeyId,
    service_name: params.serviceName ?? AI_GATEWAY_SERVICE_NAME,
  });
}

describe("aiGateway.getApiKeysLastUsed", () => {
  it("returns the latest gateway request per key from the ingestion project in the last 7 days", async () => {
    const { org, ingestionProject, otherProject } = await prepareOrganization();
    const owner = await callerFor(org, Role.OWNER);
    await prisma.gatewayConfig.create({
      data: {
        organizationId: org.id,
        defaultIngestionProjectId: ingestionProject.id,
      },
    });
    const createKey = (name: string) =>
      owner.aiGateway.createApiKey({ orgId: org.id, name, metadata: {} });
    const recentKey = await createKey("Recent");
    const staleKey = await createKey("Stale");
    const sdkOnlyKey = await createKey("SDK only");
    const now = Date.now();
    const latest = new Date(now - HOUR_MS);
    await createEventsCh([
      gatewayRequest({
        projectId: ingestionProject.id,
        apiKeyId: recentKey!.id,
        at: new Date(now - 2 * DAY_MS),
      }),
      gatewayRequest({
        projectId: ingestionProject.id,
        apiKeyId: recentKey!.id,
        at: latest,
      }),
      // Newer traffic outside the ingestion project must not count.
      gatewayRequest({
        projectId: otherProject.id,
        apiKeyId: recentKey!.id,
        at: new Date(now - 60_000),
      }),
      gatewayRequest({
        projectId: ingestionProject.id,
        apiKeyId: staleKey!.id,
        at: new Date(now - 8 * DAY_MS),
      }),
      gatewayRequest({
        projectId: ingestionProject.id,
        apiKeyId: sdkOnlyKey!.id,
        at: latest,
        serviceName: "my-sdk-app",
      }),
    ]);

    const result = await owner.aiGateway.getApiKeysLastUsed({
      orgId: org.id,
      apiKeyIds: [recentKey!.id, staleKey!.id, sdkOnlyKey!.id],
    });

    expect(result).toEqual({
      isTracked: true,
      apiKeys: [{ id: recentKey!.id, lastUsedAt: latest }],
    });
  });

  it("drops key ids the caller cannot list and rejects callers who cannot list keys", async () => {
    const { org, ingestionProject } = await prepareOrganization();
    const owner = await callerFor(org, Role.OWNER);
    const member = await callerFor(org, Role.MEMBER);
    const viewer = await callerFor(org, Role.VIEWER);
    await prisma.gatewayConfig.create({
      data: {
        organizationId: org.id,
        defaultIngestionProjectId: ingestionProject.id,
      },
    });
    const ownerKey = await owner.aiGateway.createApiKey({
      orgId: org.id,
      name: "Owner key",
      metadata: {},
    });
    const memberKey = await member.aiGateway.createApiKey({
      orgId: org.id,
      name: "Member key",
      metadata: {},
    });
    const at = new Date(Date.now() - HOUR_MS);
    await createEventsCh(
      [ownerKey, memberKey].map((key) =>
        gatewayRequest({
          projectId: ingestionProject.id,
          apiKeyId: key.id,
          at,
        }),
      ),
    );
    const apiKeyIds = [ownerKey.id, memberKey.id];

    const memberResult = await member.aiGateway.getApiKeysLastUsed({
      orgId: org.id,
      apiKeyIds,
    });
    expect(memberResult.apiKeys).toEqual([
      { id: memberKey.id, lastUsedAt: at },
    ]);

    const otherOrg = await prepareOrganization();
    const outsider = await callerFor(otherOrg.org, Role.OWNER);
    await expect(
      outsider.aiGateway.getApiKeysLastUsed({ orgId: org.id, apiKeyIds }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      viewer.aiGateway.getApiKeysLastUsed({ orgId: org.id, apiKeyIds }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reports usage as untracked in ingestion mode NONE or without an active ingestion project", async () => {
    const { org, ingestionProject } = await prepareOrganization();
    const owner = await callerFor(org, Role.OWNER);
    const key = await owner.aiGateway.createApiKey({
      orgId: org.id,
      name: "Key",
      metadata: {},
    });
    await createEventsCh([
      gatewayRequest({
        projectId: ingestionProject.id,
        apiKeyId: key.id,
        at: new Date(Date.now() - HOUR_MS),
      }),
    ]);
    const input = { orgId: org.id, apiKeyIds: [key.id] };
    const untracked = { isTracked: false, apiKeys: [] };

    await expect(owner.aiGateway.getApiKeysLastUsed(input)).resolves.toEqual(
      untracked,
    );

    // NONE keeps a linked project. Cloud runs a stored NONE as USAGE, so
    // traffic is still recorded there; self-hosted sends none.
    await prisma.gatewayConfig.create({
      data: {
        organizationId: org.id,
        defaultIngestionProjectId: ingestionProject.id,
        ingestionMode: "NONE",
      },
    });
    Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "DEV" });
    await expect(
      owner.aiGateway.getApiKeysLastUsed(input),
    ).resolves.toMatchObject({ isTracked: true, apiKeys: [{ id: key.id }] });

    Object.assign(env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_AI_GATEWAY_DEPLOYED: "true",
    });
    await expect(owner.aiGateway.getApiKeysLastUsed(input)).resolves.toEqual(
      untracked,
    );

    await prisma.gatewayConfig.update({
      where: { organizationId: org.id },
      data: { ingestionMode: "USAGE" },
    });
    await prisma.project.update({
      where: { id: ingestionProject.id },
      data: { deletedAt: new Date() },
    });
    await expect(owner.aiGateway.getApiKeysLastUsed(input)).resolves.toEqual(
      untracked,
    );
  });
});
