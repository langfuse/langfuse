import { randomUUID } from "crypto";
import { decrypt } from "@langfuse/shared/encryption";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  createOrgMembership,
  deleteOrgMembership,
} from "@langfuse/shared/memberships";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { env } from "@/src/env.mjs";
import {
  GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { GatewayGuardrailService } from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailService";
import { decodeBedrockApiKey } from "@/src/features/ai-gateway/server/provider/bedrock";
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
  redactionLabel?: string | null;
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
      redactionLabel: params.redactionLabel ?? null,
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
  vi.restoreAllMocks();
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
      redactionLabel: "[EMAIL]",
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
      "Redact rule",
      "User rule",
    ]);
    expect(resolved[0]).toEqual({
      id: expect.any(String),
      name: "Key rule",
      type: "regex",
      action: "block",
      patterns: [...GATEWAY_GUARDRAIL_PRESETS.email.patterns],
    });
    expect(resolved[3]).toEqual({
      id: expect.any(String),
      name: "Redact rule",
      type: "regex",
      action: "redact",
      patterns: [...GATEWAY_GUARDRAIL_PRESETS.email.patterns],
      redaction_label: "[EMAIL]",
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
      type: "REGEX",
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
        type: "REGEX",
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
        type: "REGEX",
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
        type: "REGEX",
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
        type: "REGEX",
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
      type: "REGEX",
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
        type: "REGEX",
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
      type: "REGEX",
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
        type: "REGEX",
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
      type: "REGEX",
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
      type: "REGEX",
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
        type: "REGEX",
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
        type: "REGEX",
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
      type: "REGEX",
      name: "Secrets",
      action: "BLOCK",
      presets: ["langfuse_api_key", "jwt"],
      secretPrefixes: ["acme_sk_"],
      assignments: [{ scope: "ORGANIZATION" }],
    });
    const containsRule = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "REGEX",
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
    expect(resolvedSecret?.type).toBe("regex");
    expect(
      resolvedSecret?.type === "regex" ? resolvedSecret.patterns : [],
    ).toHaveLength(3);
    expect(
      resolvedSecret?.type === "regex" ? resolvedSecret.patterns[2] : "",
    ).toContain("acme_sk_");
    expect(resolvedContains?.type).toBe("regex");
    expect(
      resolvedContains?.type === "regex" ? resolvedContains.patterns : [],
    ).toHaveLength(1);
    expect(
      resolvedContains?.type === "regex" ? resolvedContains.patterns[0] : "",
    ).toContain("[Cc][Oo][Nn]");

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

  it("creates, edits, resolves, and encrypts Bedrock guardrails without returning the API key", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const owner = await createUser("Bedrock Owner");
    const keyId = await createKey(orgId, owner.id, { gateway: true });
    const ownerCaller = createCaller({
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ action: "NONE" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    // Rejects invalid guardrail ID, version, or region before calling AWS
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        type: "BEDROCK",
        name: "Bad ID",
        action: "BLOCK",
        bedrock: {
          guardrailId: "../evil",
          guardrailVersion: "1",
          region: "us-east-1",
          apiKey: "bedrock-secret-1",
        },
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fetchSpy).not.toHaveBeenCalled();

    // Test endpoint returns provider response when AWS rejects the key
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Access denied" }), {
        status: 403,
        statusText: "Forbidden",
      }),
    );
    const failedTest = await ownerCaller.aiGateway.guardrails.test({
      orgId,
      type: "BEDROCK",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
        apiKey: "bad-key",
      },
    });
    expect(failedTest).toEqual({
      success: false,
      providerResponse: {
        status: 403,
        statusText: "Forbidden",
        body: JSON.stringify({ message: "Access denied" }),
      },
    });

    // Save rejects if Bedrock rejects the guardrail test
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Guardrail not found" }), {
        status: 404,
      }),
    );
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        type: "BEDROCK",
        name: "Missing guardrail",
        action: "BLOCK",
        bedrock: {
          guardrailId: "abc123def456",
          guardrailVersion: "1",
          region: "us-east-1",
          apiKey: "bedrock-secret-1",
        },
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Successful test & create sends ApplyGuardrail with Bearer auth
    const passedTest = await ownerCaller.aiGateway.guardrails.test({
      orgId,
      type: "BEDROCK",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
        apiKey: "bedrock-secret-1",
      },
    });
    expect(passedTest).toEqual({ success: true });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "https://bedrock-runtime.us-east-1.amazonaws.com/guardrail/abc123def456/version/1/apply",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer bedrock-secret-1",
        }),
      }),
    );

    const created = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "BEDROCK",
      name: "Bedrock content filter",
      action: "BLOCK",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
        apiKey: "bedrock-secret-1",
      },
      assignments: [{ scope: "ORGANIZATION" }],
    });
    expect(created.type).toBe("BEDROCK");
    expect(created.bedrock).toEqual({
      guardrailId: "abc123def456",
      guardrailVersion: "1",
      region: "us-east-1",
    });
    expect(JSON.stringify(created)).not.toContain("bedrock-secret-1");

    // Stored encrypted in Postgres and omitted from list responses and audit logs
    const stored = await prisma.gatewayGuardrail.findUniqueOrThrow({
      where: { id: created.id },
      select: { encryptedCredential: true, config: true },
    });
    expect(stored.encryptedCredential).toBeTruthy();
    expect(stored.encryptedCredential).not.toContain("bedrock-secret-1");
    expect(decodeBedrockApiKey(decrypt(stored.encryptedCredential!))).toBe(
      "bedrock-secret-1",
    );
    expect(JSON.stringify(stored.config)).not.toContain("bedrock-secret-1");

    const listed = await ownerCaller.aiGateway.guardrails.list({ orgId });
    expect(JSON.stringify(listed)).not.toContain("bedrock-secret-1");
    expect(JSON.stringify(listed)).not.toContain(stored.encryptedCredential!);

    const audits = await prisma.auditLog.findMany({
      where: { orgId, resourceId: created.id },
    });
    expect(JSON.stringify(audits)).not.toContain("bedrock-secret-1");
    expect(JSON.stringify(audits)).not.toContain(stored.encryptedCredential!);

    // Resolve keeps credential encrypted for the cache
    const resolved = await new GatewayGuardrailService(prisma).resolveForKey({
      organizationId: orgId,
      apiKeyId: keyId,
      userId: owner.id,
    });
    expect(resolved).toEqual([
      {
        id: created.id,
        name: "Bedrock content filter",
        type: "bedrock",
        action: "block",
        guardrail_id: "abc123def456",
        guardrail_version: "1",
        region: "us-east-1",
        encrypted_credential: stored.encryptedCredential,
      },
    ]);

    // Testing an existing guardrail without apiKey reuses the stored encrypted key
    const retestSaved = await ownerCaller.aiGateway.guardrails.test({
      orgId,
      id: created.id,
      type: "BEDROCK",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
      },
    });
    expect(retestSaved).toEqual({ success: true });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "https://bedrock-runtime.us-east-1.amazonaws.com/guardrail/abc123def456/version/1/apply",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer bedrock-secret-1",
        }),
      }),
    );

    // Renaming without changing Bedrock config skips re-calling AWS
    const callsBeforeRename = fetchSpy.mock.calls.length;
    await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: created.id,
      type: "BEDROCK",
      name: "Bedrock content filter renamed",
      action: "LOG",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
      },
      assignments: [{ scope: "ORGANIZATION" }],
    });
    expect(fetchSpy.mock.calls.length).toBe(callsBeforeRename);

    // Updating without apiKey keeps the stored encrypted key and validates the new region/ARN
    const updatedWithoutKey = await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: created.id,
      type: "BEDROCK",
      name: "Bedrock content filter v2",
      action: "LOG",
      bedrock: {
        guardrailId:
          "arn:aws:bedrock:eu-central-1:123456789012:guardrail/abc123def456",
        guardrailVersion: "DRAFT",
        region: "eu-central-1",
      },
      assignments: [{ scope: "ORGANIZATION" }],
    });
    expect(updatedWithoutKey.bedrock).toEqual({
      guardrailId:
        "arn:aws:bedrock:eu-central-1:123456789012:guardrail/abc123def456",
      guardrailVersion: "DRAFT",
      region: "eu-central-1",
    });
    const afterKeep = await prisma.gatewayGuardrail.findUniqueOrThrow({
      where: { id: created.id },
      select: { encryptedCredential: true },
    });
    expect(afterKeep.encryptedCredential).toBe(stored.encryptedCredential);

    // Updating with a new apiKey replaces the encrypted key
    await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: created.id,
      type: "BEDROCK",
      name: "Bedrock content filter v2",
      action: "LOG",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "2",
        region: "eu-central-1",
        apiKey: "bedrock-secret-2",
      },
      assignments: [{ scope: "ORGANIZATION" }],
    });
    const afterRotate = await prisma.gatewayGuardrail.findUniqueOrThrow({
      where: { id: created.id },
      select: { encryptedCredential: true },
    });
    expect(decodeBedrockApiKey(decrypt(afterRotate.encryptedCredential!))).toBe(
      "bedrock-secret-2",
    );

    // Switching guardrail type on update is rejected
    await expect(
      ownerCaller.aiGateway.guardrails.update({
        orgId,
        id: created.id,
        type: "REGEX",
        name: "Cannot convert",
        action: "BLOCK",
        presets: ["email"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("persists, validates, and resolves REDACT replacement labels for regex and Bedrock guardrails", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const owner = await createUser("Owner User");
    const ownerCaller = createCaller({
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });
    const keyId = await createKey(orgId, owner.id, {
      gateway: true,
      name: "redact-key",
    });

    // Default replacement label when omitted
    const defaultLabelRule = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "REGEX",
      name: "Default redact",
      action: "REDACT",
      presets: ["email"],
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(defaultLabelRule.action).toBe("REDACT");
    expect(defaultLabelRule.redactionLabel).toBe("[REDACTED]");

    // Custom replacement label (trimmed)
    const customLabelRule = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "REGEX",
      name: "Custom redact",
      action: "REDACT",
      redactionLabel: "  [SSN]  ",
      presets: ["us_ssn"],
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(customLabelRule.redactionLabel).toBe("[SSN]");

    // Rejects blank, control-char, and overly long replacement labels
    for (const invalidLabel of ["   ", "bad\nlabel", "x".repeat(65)]) {
      await expect(
        ownerCaller.aiGateway.guardrails.create({
          orgId,
          type: "REGEX",
          name: `Invalid ${invalidLabel.length}`,
          action: "REDACT",
          redactionLabel: invalidLabel,
          presets: ["email"],
          assignments: [{ scope: "ORGANIZATION" }],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    // Bedrock REDACT guardrail persists and resolves redaction_label
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ action: "NONE" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const bedrockRedact = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "BEDROCK",
      name: "Bedrock redact",
      action: "REDACT",
      redactionLabel: "[PII]",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
        apiKey: "bedrock-secret-redact",
      },
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(bedrockRedact.action).toBe("REDACT");
    expect(bedrockRedact.redactionLabel).toBe("[PII]");

    const resolved = await new GatewayGuardrailService(prisma).resolveForKey({
      organizationId: orgId,
      apiKeyId: keyId,
      userId: owner.id,
    });
    expect(resolved).toEqual([
      expect.objectContaining({
        id: bedrockRedact.id,
        type: "bedrock",
        action: "redact",
        redaction_label: "[PII]",
      }),
      expect.objectContaining({
        id: customLabelRule.id,
        type: "regex",
        action: "redact",
        redaction_label: "[SSN]",
      }),
      expect.objectContaining({
        id: defaultLabelRule.id,
        type: "regex",
        action: "redact",
        redaction_label: "[REDACTED]",
      }),
    ]);

    // Switching REDACT -> BLOCK clears redactionLabel to null
    const switchedToBlock = await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: customLabelRule.id,
      type: "REGEX",
      name: "Custom redact",
      action: "BLOCK",
      presets: ["us_ssn"],
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(switchedToBlock.action).toBe("BLOCK");
    expect(switchedToBlock.redactionLabel).toBeNull();
  });
});
