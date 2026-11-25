import { randomUUID } from "crypto";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  createOrgMembership,
  deleteOrgMembership,
} from "@langfuse/shared/memberships";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { env } from "@/src/env.mjs";
import {
  GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
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
      patterns: [...GATEWAY_GUARDRAIL_PRESETS.email.patterns],
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
    await expect(
      caller.aiGateway.guardrails.list({ orgId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Self-hosted production: blocked
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
      LANGFUSE_AI_GATEWAY_DEPLOYED: "true",
    });
    await expect(
      caller.aiGateway.guardrails.list({ orgId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Staging: allowed
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });
    const stagingResult = await caller.aiGateway.guardrails.list({ orgId });
    expect(stagingResult.rows).toEqual([]);

    // Preview: allowed
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      NEXT_PUBLIC_PREVIEW_PR_URL: "https://github.com/langfuse/langfuse/pull/1",
    });
    const previewResult = await caller.aiGateway.guardrails.list({ orgId });
    expect(previewResult.rows).toEqual([]);
  });

  it("enforces OWNER/ADMIN management, redacts other identities for non-managers, and validates CRUD", async () => {
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
    const created = await ownerCaller.aiGateway.guardrails.create({
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

    // Duplicate name rejected with CONFLICT
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        name: "Block SSNs",
        action: "LOG",
        presets: ["email"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Combining Everyone with a specific user/key rejected with BAD_REQUEST
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        name: "Bad combo",
        action: "BLOCK",
        presets: ["email"],
        assignments: [
          { scope: "ORGANIZATION" },
          { scope: "API_KEY", apiKeyId: keyId },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Cross-tenant key rejected with NOT_FOUND
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        name: "Foreign key",
        action: "BLOCK",
        presets: ["email"],
        assignments: [{ scope: "API_KEY", apiKeyId: otherOrgKeyId }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Non-admins cannot create, search targets, or delete (FORBIDDEN)
    await expect(
      memberCaller.aiGateway.guardrails.create({
        orgId,
        name: "Member rule",
        action: "LOG",
        presets: ["email"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      memberCaller.aiGateway.guardrails.searchTargets({ orgId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      viewerCaller.aiGateway.guardrails.delete({
        orgId,
        target: { type: "ids", ids: [created.id] },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Admin searches targets and updates guardrail to specific user + key
    const targets = await ownerCaller.aiGateway.guardrails.searchTargets({
      orgId,
      searchQuery: "support",
    });
    expect(targets.apiKeys.map((k) => k.id)).toContain(keyId);

    const updated = await ownerCaller.aiGateway.guardrails.update({
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

    // VIEWER sees the guardrail read-only, with other members' identities and key names redacted
    const viewerList = await viewerCaller.aiGateway.guardrails.list({ orgId });
    expect(viewerList.totalCount).toBe(1);
    expect(viewerList.rows[0]?.assignments).toEqual([
      expect.objectContaining({
        scope: "API_KEY",
        apiKeyId: null,
        label: null,
      }),
      expect.objectContaining({ scope: "USER", userId: null, label: null }),
    ]);

    // MEMBER sees their own user and own key labels
    const memberList = await memberCaller.aiGateway.guardrails.list({ orgId });
    expect(memberList.rows[0]?.assignments).toEqual([
      expect.objectContaining({
        scope: "API_KEY",
        apiKeyId: keyId,
        label: "support-bot-prod",
      }),
      expect.objectContaining({
        scope: "USER",
        userId: member.id,
        label: "Member User",
      }),
    ]);

    // Removing a targeted member still allows admins to edit/rename the guardrail
    await deleteOrgMembership(prisma, { orgId, userId: member.id });
    const renamedAfterMemberRemoval =
      await ownerCaller.aiGateway.guardrails.update({
        orgId,
        id: created.id,
        name: "Log PII renamed",
        action: "LOG",
        presets: ["email"],
        assignments: [
          { scope: "USER", userId: member.id },
          { scope: "API_KEY", apiKeyId: keyId },
        ],
      });
    expect(renamedAfterMemberRemoval.name).toBe("Log PII renamed");

    // Bulk delete by matching search
    const deleted = await ownerCaller.aiGateway.guardrails.delete({
      orgId,
      target: { type: "matching", searchQuery: "renamed" },
    });
    expect(deleted.deletedCount).toBe(1);

    const afterDelete = await ownerCaller.aiGateway.guardrails.list({ orgId });
    expect(afterDelete.totalCount).toBe(0);
    expect(afterDelete.organizationCount).toBe(0);
  });

  it("preserves unknown stored presets when editing a guardrail", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const owner = await createUser("Preset Owner");
    const ownerCaller = createCaller({
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });

    const guardrail = await createGuardrail({
      organizationId: orgId,
      name: "Future preset rule",
      config: { presets: ["email", "future_preset_v2"] },
      assignments: [{ scope: "ORGANIZATION" }],
    });

    await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: guardrail.id,
      name: "Future preset rule renamed",
      action: "LOG",
      presets: ["email"],
      assignments: [{ scope: "ORGANIZATION" }],
    });

    const stored = await prisma.gatewayGuardrail.findUniqueOrThrow({
      where: { id: guardrail.id },
      select: { config: true },
    });
    expect(stored.config).toEqual({
      presets: ["email", "future_preset_v2"],
    });
  });

  it("enforces a maximum of 20 guardrails per organization", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const otherOrgId = await createOrganization();
    const owner = await createUser("Limit Owner");
    const ownerCaller = createCaller({
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });
    const otherOrgCaller = createCaller({
      orgId: otherOrgId,
      userId: owner.id,
      role: Role.OWNER,
    });

    const createdIds: string[] = [];
    for (
      let index = 0;
      index < GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION;
      index++
    ) {
      const guardrail = await createGuardrail({
        organizationId: orgId,
        name: `Guardrail ${index + 1}`,
        assignments: [{ scope: "ORGANIZATION" }],
      });
      createdIds.push(guardrail.id);
    }

    // Even when search filters down totalCount, organizationCount still reflects all 20.
    const filteredList = await ownerCaller.aiGateway.guardrails.list({
      orgId,
      searchQuery: "Guardrail 1",
    });
    expect(filteredList.organizationCount).toBe(
      GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION,
    );

    // 21st guardrail in the same org is rejected with BAD_REQUEST and the support guidance message.
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        name: "Guardrail 21",
        action: "BLOCK",
        presets: ["email"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
    });

    // Another organization is unaffected.
    const otherCreated = await otherOrgCaller.aiGateway.guardrails.create({
      orgId: otherOrgId,
      name: "Other org guardrail",
      action: "LOG",
      presets: ["email"],
      assignments: [{ scope: "ORGANIZATION" }],
    });
    expect(otherCreated.name).toBe("Other org guardrail");

    // Deleting one frees a slot.
    await ownerCaller.aiGateway.guardrails.delete({
      orgId,
      target: { type: "ids", ids: [createdIds[0]!] },
    });
    const createdAfterDelete = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      name: "Guardrail 21",
      action: "BLOCK",
      presets: ["email"],
      assignments: [{ scope: "ORGANIZATION" }],
    });
    expect(createdAfterDelete.name).toBe("Guardrail 21");
  });

  it("compiles custom secret prefixes, contains word lists, rejects non-ASCII words, and supports bulk applies-to", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const owner = await createUser("Rules Owner");
    const member = await createUser("Rules Member");
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
    const keyId = await createKey(orgId, member.id, {
      gateway: true,
      name: "rules-key",
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

    // Rejects invalid custom secret prefix (too short / whitespace) and non-ASCII contains word
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        name: "Bad prefix",
        action: "BLOCK",
        presets: [],
        secretPrefixes: ["ab"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        name: "Bad contains",
        action: "BLOCK",
        presets: [],
        containsWords: ["Zürich"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/ASCII/i),
    });

    // Create secret guardrail with built-in preset + custom prefix, and a contains guardrail
    const secretRule = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      name: "Secrets",
      action: "BLOCK",
      presets: ["langfuse_api_key", "jwt"],
      secretPrefixes: ["acme_sk_"],
      assignments: [{ scope: "ORGANIZATION" }],
    });
    const containsRule = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      name: "Blocked terms",
      action: "LOG",
      presets: [],
      containsWords: ["Confidential", "internal only", "confidential"],
      assignments: [{ scope: "ORGANIZATION" }],
    });

    // Resolve expands built-in presets, custom secret prefix, and whole-word ASCII case-insensitive alternation
    const resolved = await new GatewayGuardrailService(prisma).resolveForKey({
      organizationId: orgId,
      apiKeyId: keyId,
      userId: member.id,
    });
    const resolvedSecret = resolved.find((item) => item.id === secretRule.id);
    const resolvedContains = resolved.find(
      (item) => item.id === containsRule.id,
    );
    expect(resolvedSecret?.patterns).toHaveLength(3);
    expect(resolvedSecret?.patterns[2]).toContain("acme_sk_");
    expect(resolvedContains?.patterns).toHaveLength(1);
    expect(resolvedContains?.patterns[0]).toContain("[Cc][Oo][Nn]");

    // Bulk set applies-to denied for non-admin
    await expect(
      memberCaller.aiGateway.guardrails.setAssignments({
        orgId,
        target: { type: "ids", ids: [secretRule.id, containsRule.id] },
        assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Admin updates Applies to on both guardrails at once
    const bulkUpdated = await ownerCaller.aiGateway.guardrails.setAssignments({
      orgId,
      target: { type: "ids", ids: [secretRule.id, containsRule.id] },
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(bulkUpdated.updatedCount).toBe(2);

    const listed = await ownerCaller.aiGateway.guardrails.list({ orgId });
    for (const row of listed.rows) {
      expect(row.assignments).toEqual([
        expect.objectContaining({ scope: "API_KEY", apiKeyId: keyId }),
      ]);
    }
  });
});
