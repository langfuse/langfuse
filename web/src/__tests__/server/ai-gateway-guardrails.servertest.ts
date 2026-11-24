import { randomUUID } from "crypto";
import { prisma, Role } from "@langfuse/shared/src/db";
import { createOrgMembership } from "@langfuse/shared/memberships";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { env } from "@/src/env.mjs";
import { GatewayGuardrailService } from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailService";
import { GATEWAY_GUARDRAIL_PRESETS } from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const organizationIds: string[] = [];
const userIds: string[] = [];
const originalEnv = {
  NODE_ENV: env.NODE_ENV,
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  NEXT_PUBLIC_PREVIEW_PR_URL: env.NEXT_PUBLIC_PREVIEW_PR_URL,
  LANGFUSE_AI_GATEWAY_ENABLED: env.LANGFUSE_AI_GATEWAY_ENABLED,
  LANGFUSE_AI_GATEWAY_DEPLOYED: env.LANGFUSE_AI_GATEWAY_DEPLOYED,
};

const createOrganization = async () => {
  const organization = await prisma.organization.create({
    data: { id: randomUUID(), name: "Guardrails test" },
  });
  organizationIds.push(organization.id);
  return organization.id;
};

const createUser = async (name?: string) => {
  const user = await prisma.user.create({
    data: {
      email: `guardrails-${randomUUID()}@example.com`,
      name: name ?? null,
    },
  });
  userIds.push(user.id);
  return user;
};

const createKey = async (
  orgId: string,
  userId: string | null,
  options?: { gateway?: boolean; name?: string },
) => {
  const { id } = await createApiKey(prisma, {
    tenant: OrganizationId(orgId),
    scope: userId ? UserId(userId) : OrganizationId(orgId),
    role: SystemRoleId("AI_GATEWAY_INFERENCE"),
    createdBy: "system",
    name: options?.name,
  });
  if (options?.gateway) {
    await prisma.gatewayApiKeyAssociation.create({ data: { apiKeyId: id } });
  }
  return id;
};

const createCaller = (params: {
  orgId: string;
  userId: string;
  role: Role;
}) => {
  const session = createSession({
    user: { id: params.userId },
    organizations: [
      {
        id: params.orgId,
        name: "Guardrails test",
        role: params.role,
      },
    ],
  });
  return appRouter.createCaller(
    createInnerTRPCContext({ session, headers: {} }),
  );
};

const createGuardrail = async (params: {
  organizationId: string;
  name: string;
  action?: "BLOCK" | "LOG" | "REDACT";
  config?: object;
  assignments: Array<
    | { scope: "ORGANIZATION" }
    | { scope: "API_KEY"; apiKeyId: string }
    | { scope: "USER"; userId: string }
  >;
}) =>
  prisma.gatewayGuardrail.create({
    data: {
      organizationId: params.organizationId,
      name: params.name,
      action: params.action ?? "BLOCK",
      config: params.config ?? { presets: ["email"] },
      assignments: {
        create: params.assignments.map((assignment) => ({
          ...assignment,
          organizationId: params.organizationId,
        })),
      },
    },
  });

afterEach(() => {
  Object.assign(env, originalEnv);
});

afterAll(async () => {
  Object.assign(env, originalEnv);
  await prisma.organization.deleteMany({
    where: { id: { in: organizationIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("GatewayGuardrailService", () => {
  it("resolves the organization's, the key's and its user's guardrails, each once", async () => {
    const organizationId = await createOrganization();
    const otherOrganizationId = await createOrganization();
    const user = (await createUser()).id;
    const otherUser = (await createUser()).id;
    const key = await createKey(organizationId, user);
    const otherKey = await createKey(organizationId, otherUser);
    const serviceKey = await createKey(organizationId, null);
    await createGuardrail({
      organizationId,
      name: "Organization PII",
      assignments: [
        { scope: "ORGANIZATION" },
        { scope: "API_KEY", apiKeyId: key },
      ],
    });
    await createGuardrail({
      organizationId,
      name: "Key rule",
      assignments: [{ scope: "API_KEY", apiKeyId: key }],
    });
    await createGuardrail({
      organizationId,
      name: "User rule",
      assignments: [{ scope: "USER", userId: user }],
    });
    await createGuardrail({
      organizationId,
      name: "Other key and user",
      assignments: [
        { scope: "API_KEY", apiKeyId: otherKey },
        { scope: "USER", userId: otherUser },
      ],
    });
    await createGuardrail({
      organizationId,
      name: "Invalid config",
      config: { presets: ["not_a_preset"] },
      assignments: [{ scope: "ORGANIZATION" }],
    });
    await createGuardrail({
      organizationId,
      name: "Partly unknown presets",
      config: { presets: ["email", "not_a_preset"] },
      assignments: [{ scope: "API_KEY", apiKeyId: key }],
    });
    await createGuardrail({
      organizationId,
      name: "Redact rule",
      action: "REDACT",
      assignments: [{ scope: "API_KEY", apiKeyId: key }],
    });
    await createGuardrail({
      organizationId: otherOrganizationId,
      name: "Other organization",
      assignments: [{ scope: "ORGANIZATION" }],
    });

    const service = new GatewayGuardrailService(prisma);
    const resolved = await service.resolveForKey({
      organizationId,
      apiKeyId: key,
      userId: user,
    });
    expect(resolved.map(({ name }) => name)).toEqual([
      "Key rule",
      "Organization PII",
      "Partly unknown presets",
      "User rule",
    ]);
    expect(resolved[0]).toEqual({
      id: expect.any(String),
      name: "Key rule",
      action: "block",
      patterns: [...GATEWAY_GUARDRAIL_PRESETS.email],
    });

    const forServiceKey = await service.resolveForKey({
      organizationId,
      apiKeyId: serviceKey,
      userId: null,
    });
    expect(forServiceKey.map(({ name }) => name)).toEqual(["Organization PII"]);
  });
});

describe("aiGateway guardrails tRPC", () => {
  it("gates guardrails to preview, staging, and local dev — blocking Cloud prod and self-hosted prod", async () => {
    const orgId = await createOrganization();
    const admin = await createUser("Admin User");
    const caller = createCaller({ orgId, userId: admin.id, role: Role.ADMIN });

    // Cloud production EU: blocked
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });
    await expect(caller.aiGateway.listGuardrails({ orgId })).rejects.toThrow(
      /not enabled/i,
    );

    // Self-hosted production: blocked
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
      LANGFUSE_AI_GATEWAY_DEPLOYED: "true",
    });
    await expect(caller.aiGateway.listGuardrails({ orgId })).rejects.toThrow(
      /not enabled/i,
    );

    // Staging: allowed
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });
    const stagingResult = await caller.aiGateway.listGuardrails({ orgId });
    expect(stagingResult.rows).toEqual([]);

    // Preview: allowed
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      NEXT_PUBLIC_PREVIEW_PR_URL: "https://github.com/langfuse/langfuse/pull/1",
    });
    const previewResult = await caller.aiGateway.listGuardrails({ orgId });
    expect(previewResult.rows).toEqual([]);
  });

  it("enforces OWNER/ADMIN management vs read-only access and CRUD constraints", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const otherOrgId = await createOrganization();
    const owner = await createUser("Owner User");
    const member = await createUser("Member User");
    const viewer = await createUser("Viewer User");
    await createOrgMembership(prisma, {
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });
    await createOrgMembership(prisma, {
      orgId,
      userId: member.id,
      role: Role.MEMBER,
    });
    await createOrgMembership(prisma, {
      orgId,
      userId: viewer.id,
      role: Role.VIEWER,
    });
    const keyId = await createKey(orgId, member.id, {
      gateway: true,
      name: "support-bot-prod",
    });
    const otherOrgKeyId = await createKey(otherOrgId, null, {
      gateway: true,
      name: "other-org-key",
    });

    const ownerCaller = createCaller({
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });
    const memberCaller = createCaller({
      orgId,
      userId: member.id,
      role: Role.MEMBER,
    });
    const viewerCaller = createCaller({
      orgId,
      userId: viewer.id,
      role: Role.VIEWER,
    });

    // Owner creates a guardrail for Everyone
    const created = await ownerCaller.aiGateway.createGuardrail({
      orgId,
      name: "Block SSNs",
      action: "BLOCK",
      presets: ["us_ssn", "credit_card"],
      assignments: [{ scope: "ORGANIZATION" }],
    });
    expect(created.name).toBe("Block SSNs");
    expect(created.presets).toEqual(["us_ssn", "credit_card"]);
    expect(created.assignments).toEqual([
      expect.objectContaining({ scope: "ORGANIZATION", label: "Everyone" }),
    ]);

    // Duplicate name rejected
    await expect(
      ownerCaller.aiGateway.createGuardrail({
        orgId,
        name: "Block SSNs",
        action: "LOG",
        presets: ["email"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toThrow(/already exists/i);

    // Combining Everyone with a specific user/key rejected
    await expect(
      ownerCaller.aiGateway.createGuardrail({
        orgId,
        name: "Bad combo",
        action: "BLOCK",
        presets: ["email"],
        assignments: [
          { scope: "ORGANIZATION" },
          { scope: "API_KEY", apiKeyId: keyId },
        ],
      }),
    ).rejects.toThrow(/Everyone cannot be combined/i);

    // Cross-tenant key rejected
    await expect(
      ownerCaller.aiGateway.createGuardrail({
        orgId,
        name: "Foreign key",
        action: "BLOCK",
        presets: ["email"],
        assignments: [{ scope: "API_KEY", apiKeyId: otherOrgKeyId }],
      }),
    ).rejects.toThrow(/not found/i);

    // Non-admins can list read-only, but cannot manage or search targets
    const memberList = await memberCaller.aiGateway.listGuardrails({ orgId });
    expect(memberList.totalCount).toBe(1);
    const viewerList = await viewerCaller.aiGateway.listGuardrails({ orgId });
    expect(viewerList.totalCount).toBe(1);

    await expect(
      memberCaller.aiGateway.createGuardrail({
        orgId,
        name: "Member rule",
        action: "LOG",
        presets: ["email"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toThrow();
    await expect(
      memberCaller.aiGateway.searchGuardrailTargets({ orgId }),
    ).rejects.toThrow();
    await expect(
      viewerCaller.aiGateway.deleteGuardrails({
        orgId,
        target: { type: "ids", ids: [created.id] },
      }),
    ).rejects.toThrow();

    // Admin searches targets and updates guardrail to specific user + key
    const targets = await ownerCaller.aiGateway.searchGuardrailTargets({
      orgId,
      searchQuery: "support",
    });
    expect(targets.apiKeys.map((k) => k.id)).toContain(keyId);

    const updated = await ownerCaller.aiGateway.updateGuardrail({
      orgId,
      id: created.id,
      name: "Log PII for support",
      action: "LOG",
      presets: ["email", "iban"],
      assignments: [
        { scope: "USER", userId: member.id },
        { scope: "API_KEY", apiKeyId: keyId },
      ],
    });
    expect(updated.name).toBe("Log PII for support");
    expect(updated.action).toBe("LOG");
    expect(updated.assignments).toHaveLength(2);

    // Bulk delete by matching search
    const deleted = await ownerCaller.aiGateway.deleteGuardrails({
      orgId,
      target: { type: "matching", searchQuery: "support" },
    });
    expect(deleted.deletedCount).toBe(1);

    const afterDelete = await ownerCaller.aiGateway.listGuardrails({ orgId });
    expect(afterDelete.totalCount).toBe(0);
  });
});
