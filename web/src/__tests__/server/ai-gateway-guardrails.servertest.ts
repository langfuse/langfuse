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
  GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE,
  GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE,
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
      scope: "last_turn",
      patterns: [...GATEWAY_GUARDRAIL_PRESETS.email.patterns],
    });
    expect(resolved[3]).toEqual({
      id: expect.any(String),
      name: "Redact rule",
      type: "regex",
      action: "redact",
      scope: "last_turn",
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
  it("makes guardrails available wherever the AI Gateway is enabled for the organization", async () => {
    const orgId = await createOrganization();
    const admin = await createUser("Admin User");
    const caller = createCaller({ orgId, userId: admin.id, role: Role.ADMIN });

    // Cloud production EU: allowed
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });
    const cloudResult = await caller.aiGateway.guardrails.list({ orgId });
    expect(cloudResult.rows).toEqual([]);

    // Self-hosted production: allowed
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
      LANGFUSE_AI_GATEWAY_DEPLOYED: "true",
    });
    const selfHostedResult = await caller.aiGateway.guardrails.list({ orgId });
    expect(selfHostedResult.rows).toEqual([]);

    // AI Gateway disabled for the organization: blocked
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "false",
    });
    await expect(
      caller.aiGateway.guardrails.list({ orgId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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

    // Blocking external guardrails only evaluate the last turn
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        type: "OPENAI_MODERATION",
        name: "Moderation entire input",
        action: "BLOCK",
        scope: "ENTIRE_INPUT",
        openAiModeration: { region: "us", apiKey: "sk-test-key" },
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "Block guardrails only evaluate the last turn",
      ),
    });

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
        action: "ENFORCE",
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
        action: "ENFORCE",
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
      action: "ENFORCE",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
        apiKey: "bedrock-secret-1",
      },
      assignments: [{ scope: "ORGANIZATION" }],
    });
    expect(created.type).toBe("BEDROCK");
    expect(created.action).toBe("ENFORCE");
    expect(created.redactionLabel).toBeNull();
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
        action: "enforce",
        scope: "last_turn",
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

  it("persists, validates, and resolves REDACT replacement labels for regex and ENFORCE for Bedrock guardrails", async () => {
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

    // Custom replacement label (trimmed) + ENTIRE_INPUT scope
    const customLabelRule = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "REGEX",
      name: "Custom redact",
      action: "REDACT",
      scope: "ENTIRE_INPUT",
      redactionLabel: "  [SSN]  ",
      presets: ["us_ssn"],
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(customLabelRule.redactionLabel).toBe("[SSN]");
    expect(customLabelRule.scope).toBe("ENTIRE_INPUT");

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

    // Bedrock ENFORCE guardrail persists with null redactionLabel and resolves action "enforce"
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ action: "NONE" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const bedrockEnforce = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "BEDROCK",
      name: "Bedrock enforce",
      action: "ENFORCE",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
        apiKey: "bedrock-secret-enforce",
      },
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(bedrockEnforce.action).toBe("ENFORCE");
    expect(bedrockEnforce.redactionLabel).toBeNull();

    const resolved = await new GatewayGuardrailService(prisma).resolveForKey({
      organizationId: orgId,
      apiKeyId: keyId,
      userId: owner.id,
    });
    expect(resolved).toEqual([
      expect.objectContaining({
        id: bedrockEnforce.id,
        type: "bedrock",
        action: "enforce",
      }),
      expect.objectContaining({
        id: customLabelRule.id,
        type: "regex",
        action: "redact",
        scope: "entire_input",
        redaction_label: "[SSN]",
      }),
      expect.objectContaining({
        id: defaultLabelRule.id,
        type: "regex",
        action: "redact",
        scope: "last_turn",
        redaction_label: "[REDACTED]",
      }),
    ]);

    // Switching REDACT (ENTIRE_INPUT) -> BLOCK clears redactionLabel and resets scope to LAST_TURN
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
    expect(switchedToBlock.scope).toBe("LAST_TURN");
    expect(switchedToBlock.redactionLabel).toBeNull();

    // Rejects ENTIRE_INPUT scope for BLOCK guardrails
    await expect(
      ownerCaller.aiGateway.guardrails.create({
        orgId,
        type: "REGEX",
        name: "Block entire input",
        action: "BLOCK",
        scope: "ENTIRE_INPUT" as never,
        presets: ["email"],
        assignments: [{ scope: "ORGANIZATION" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("validates custom regex rules with the WASM engine, previews UTF-16 spans, and enforces 128 KiB rule and 512 KiB org limits", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const owner = await createUser("Regex Owner");
    const ownerCaller = createCaller({
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });
    const keyId = await createKey(orgId, owner.id, {
      gateway: true,
      name: "regex-key",
    });

    // Rejects Unicode, lookaround, backreferences, empty-matching, syntax errors, and >128 KiB rules
    for (const badPattern of [
      String.raw`(?u:\w)+`,
      String.raw`\p{L}+`,
      String.raw`foo(?=bar)`,
      String.raw`(a)\1`,
      "x?",
      "(unclosed",
      String.raw`\w{1,500}`.repeat(5),
    ]) {
      await expect(
        ownerCaller.aiGateway.guardrails.create({
          orgId,
          type: "REGEX",
          name: `Bad ${badPattern.slice(0, 12)}`,
          action: "BLOCK",
          customRegex: badPattern,
          assignments: [{ scope: "ORGANIZATION" }],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    // Preview returns UTF-16 match spans (accounting for astral emoji) and validation errors
    const sampleText = "😀 Order ORD-123456 and ORD-999999";
    const validPreview = await ownerCaller.aiGateway.guardrails.previewRegex({
      orgId,
      pattern: String.raw`\bORD-\d{6}\b`,
      text: sampleText,
    });
    expect(validPreview.valid).toBe(true);
    expect(
      validPreview.matches.map(({ start, end }) =>
        sampleText.slice(start, end),
      ),
    ).toEqual(["ORD-123456", "ORD-999999"]);

    const invalidPreview = await ownerCaller.aiGateway.guardrails.previewRegex({
      orgId,
      pattern: String.raw`(?u:\w)+`,
      text: sampleText,
    });
    expect(invalidPreview.valid).toBe(false);
    expect(invalidPreview.errorCode).toBe("unicode_not_allowed");
    expect(invalidPreview.error).toContain("external guardrail provider");
    expect(invalidPreview.matches).toEqual([]);

    const lookaroundPreview =
      await ownerCaller.aiGateway.guardrails.previewRegex({
        orgId,
        pattern: String.raw`foo(?=bar)`,
        text: sampleText,
      });
    expect(lookaroundPreview.valid).toBe(false);
    expect(lookaroundPreview.errorCode).toBe("unsupported_lookaround");
    expect(lookaroundPreview.error).toContain("Look-ahead and look-behind");
    expect(lookaroundPreview.error).toContain("external guardrail provider");
    expect(lookaroundPreview.error).not.toContain("error:");

    const syntaxPreview = await ownerCaller.aiGateway.guardrails.previewRegex({
      orgId,
      pattern: "(unclosed",
      text: sampleText,
    });
    expect(syntaxPreview.valid).toBe(false);
    expect(syntaxPreview.errorCode).toBe("syntax_error");
    expect(syntaxPreview.error).toBe(
      "Invalid regular expression: Unclosed group.",
    );

    const oversizedPreview =
      await ownerCaller.aiGateway.guardrails.previewRegex({
        orgId,
        pattern: String.raw`\w{1,1500}`,
        text: sampleText,
      });
    expect(oversizedPreview.valid).toBe(false);
    expect(oversizedPreview.errorCode).toBe("size_limit_exceeded");
    expect(oversizedPreview.error).toBe(
      GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE,
    );

    // Creates, updates, and resolves a valid custom regex (including `.`, `\S`, and negated classes)
    const created = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "REGEX",
      name: "Order IDs",
      action: "BLOCK",
      customRegex: String.raw`order=\S+`,
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(created.customRegex).toBe(String.raw`order=\S+`);

    const updated = await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: created.id,
      type: "REGEX",
      name: "Order IDs",
      action: "BLOCK",
      customRegex: String.raw`\bORD-\d{6}\b`,
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(updated.customRegex).toBe(String.raw`\bORD-\d{6}\b`);

    const resolved = await new GatewayGuardrailService(prisma).resolveForKey({
      organizationId: orgId,
      apiKeyId: keyId,
      userId: owner.id,
    });
    expect(resolved).toEqual([
      expect.objectContaining({
        id: created.id,
        type: "regex",
        action: "block",
        patterns: [String.raw`\bORD-\d{6}\b`],
      }),
    ]);

    // Enforces 512 KiB combined compiled NFA limit across an organization's guardrails
    const mediumPattern = String.raw`\w{1,500}`;
    let hitOrgLimit = false;
    for (let i = 0; i < 15; i++) {
      try {
        await ownerCaller.aiGateway.guardrails.create({
          orgId,
          type: "REGEX",
          name: `Medium rule ${i}`,
          action: "BLOCK",
          customRegex: mediumPattern,
          assignments: [{ scope: "ORGANIZATION" }],
        });
      } catch (error) {
        expect(error).toMatchObject({
          code: "BAD_REQUEST",
          message: GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE,
        });
        hitOrgLimit = true;
        break;
      }
    }
    expect(hitOrgLimit).toBe(true);

    // Unchanged rule config on an already-stored oversized guardrail still allows editing name/action/targets
    const legacyOversized = await createGuardrail({
      organizationId: orgId,
      name: "Legacy oversized",
      config: { presets: [], customRegex: String.raw`\w{1,1500}` },
      assignments: [{ scope: "ORGANIZATION" }],
    });
    const renamedLegacy = await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: legacyOversized.id,
      type: "REGEX",
      name: "Legacy oversized renamed",
      action: "LOG",
      customRegex: String.raw`\w{1,1500}`,
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(renamedLegacy.name).toBe("Legacy oversized renamed");
    expect(renamedLegacy.action).toBe("LOG");
  });

  it("denies foreign-organization guardrail IDs and missing gateway:manage scope across guardrail mutations", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const otherOrgId = await createOrganization();
    const owner = await createUser("Guardrail Owner");
    const member = await createUser("Guardrail Member");
    const otherOwner = await createUser("Other Org Owner");
    const otherOrgKeyId = await createKey(otherOrgId, otherOwner.id, {
      gateway: true,
      name: "other-org-gateway-key",
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
    const otherOwnerCaller = createCaller({
      orgId: otherOrgId,
      userId: otherOwner.id,
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

    const regexGuardrail = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "REGEX",
      name: "Org regex rule",
      action: "BLOCK",
      presets: ["email"],
      assignments: [{ scope: "ORGANIZATION" }],
    });
    const bedrockGuardrail = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "BEDROCK",
      name: "Org bedrock rule",
      action: "ENFORCE",
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
        apiKey: "victim-bedrock-secret",
      },
      assignments: [{ scope: "ORGANIZATION" }],
    });

    const guardrailIds = [regexGuardrail.id, bedrockGuardrail.id];
    const readGuardrails = () =>
      prisma.gatewayGuardrail.findMany({
        where: { id: { in: guardrailIds } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          organizationId: true,
          name: true,
          type: true,
          action: true,
          config: true,
          encryptedCredential: true,
          assignments: {
            select: { scope: true, apiKeyId: true, userId: true },
            orderBy: { scope: "asc" },
          },
        },
      });
    const guardrailsBefore = await readGuardrails();
    const auditCountBefore = await prisma.auditLog.count({
      where: { resourceId: { in: guardrailIds } },
    });
    fetchSpy.mockClear();

    // Outsider targeting another organization's orgId is rejected with UNAUTHORIZED
    const outsiderRequests = [
      () =>
        otherOwnerCaller.aiGateway.guardrails.previewRegex({
          orgId,
          pattern: "foo",
          text: "foo",
        }),
      () =>
        otherOwnerCaller.aiGateway.guardrails.test({
          orgId,
          id: bedrockGuardrail.id,
          type: "BEDROCK",
          bedrock: {
            guardrailId: "abc123def456",
            guardrailVersion: "1",
            region: "us-east-1",
          },
        }),
      () =>
        otherOwnerCaller.aiGateway.guardrails.create({
          orgId,
          type: "REGEX",
          name: "Outsider rule",
          action: "LOG",
          presets: ["email"],
          assignments: [{ scope: "ORGANIZATION" }],
        }),
      () =>
        otherOwnerCaller.aiGateway.guardrails.update({
          orgId,
          id: regexGuardrail.id,
          type: "REGEX",
          name: "Hijacked regex",
          action: "LOG",
          presets: ["iban"],
          assignments: [{ scope: "ORGANIZATION" }],
        }),
      () =>
        otherOwnerCaller.aiGateway.guardrails.setAssignments({
          orgId,
          target: { type: "ids", ids: guardrailIds },
          assignments: [{ scope: "ORGANIZATION" }],
        }),
      () =>
        otherOwnerCaller.aiGateway.guardrails.delete({
          orgId,
          target: { type: "ids", ids: guardrailIds },
        }),
    ];
    for (const request of outsiderRequests) {
      await expect(request()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "User is not a member of this organization",
      });
    }

    // Non-admins without gateway:manage cannot preview, test, or update (create, setAssignments, and delete are covered above)
    const nonAdminRequests = [
      () =>
        memberCaller.aiGateway.guardrails.previewRegex({
          orgId,
          pattern: "foo",
          text: "foo",
        }),
      () =>
        memberCaller.aiGateway.guardrails.test({
          orgId,
          id: bedrockGuardrail.id,
          type: "BEDROCK",
          bedrock: {
            guardrailId: "abc123def456",
            guardrailVersion: "1",
            region: "us-east-1",
          },
        }),
      () =>
        memberCaller.aiGateway.guardrails.update({
          orgId,
          id: regexGuardrail.id,
          type: "REGEX",
          name: "Non-admin regex edit",
          action: "LOG",
          presets: ["iban"],
          assignments: [{ scope: "ORGANIZATION" }],
        }),
    ];
    for (const request of nonAdminRequests) {
      await expect(request()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    // Foreign-organization admin submitting another org's guardrail IDs under their own orgId
    await expect(
      otherOwnerCaller.aiGateway.guardrails.update({
        orgId: otherOrgId,
        id: regexGuardrail.id,
        type: "REGEX",
        name: "Cross-org regex edit",
        action: "LOG",
        presets: ["iban"],
        assignments: [{ scope: "API_KEY", apiKeyId: otherOrgKeyId }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      otherOwnerCaller.aiGateway.guardrails.update({
        orgId: otherOrgId,
        id: bedrockGuardrail.id,
        type: "BEDROCK",
        name: "Cross-org bedrock edit",
        action: "LOG",
        bedrock: {
          guardrailId: "abc123def456",
          guardrailVersion: "2",
          region: "us-east-1",
        },
        assignments: [{ scope: "API_KEY", apiKeyId: otherOrgKeyId }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      otherOwnerCaller.aiGateway.guardrails.test({
        orgId: otherOrgId,
        id: bedrockGuardrail.id,
        type: "BEDROCK",
        bedrock: {
          guardrailId: "abc123def456",
          guardrailVersion: "1",
          region: "us-east-1",
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(
      await otherOwnerCaller.aiGateway.guardrails.setAssignments({
        orgId: otherOrgId,
        target: { type: "ids", ids: guardrailIds },
        assignments: [{ scope: "API_KEY", apiKeyId: otherOrgKeyId }],
      }),
    ).toEqual({ updatedCount: 0 });

    expect(
      await otherOwnerCaller.aiGateway.guardrails.setAssignments({
        orgId: otherOrgId,
        target: { type: "matching", searchQuery: "Org regex" },
        assignments: [{ scope: "API_KEY", apiKeyId: otherOrgKeyId }],
      }),
    ).toEqual({ updatedCount: 0 });

    expect(
      await otherOwnerCaller.aiGateway.guardrails.delete({
        orgId: otherOrgId,
        target: { type: "ids", ids: guardrailIds },
      }),
    ).toEqual({ deletedCount: 0 });

    expect(
      await otherOwnerCaller.aiGateway.guardrails.delete({
        orgId: otherOrgId,
        target: { type: "matching", searchQuery: "Org regex" },
      }),
    ).toEqual({ deletedCount: 0 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await readGuardrails()).toEqual(guardrailsBefore);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: { in: guardrailIds } },
      }),
    ).toBe(auditCountBefore);
  });

  it("creates, updates, and resolves guardrails configured for output and both", async () => {
    Object.assign(env, {
      NODE_ENV: "production",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
      LANGFUSE_AI_GATEWAY_ENABLED: "true",
    });

    const orgId = await createOrganization();
    const owner = await createUser("Owner");
    await createOrgMembership(prisma, {
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });
    const keyId = await createKey(orgId, owner.id, { gateway: true });
    const ownerCaller = createCaller({
      orgId,
      userId: owner.id,
      role: Role.OWNER,
    });

    const created = await ownerCaller.aiGateway.guardrails.create({
      orgId,
      type: "REGEX",
      name: "Output email redaction",
      action: "REDACT",
      scope: "OUTPUT",
      redactionLabel: "[EMAIL]",
      presets: ["email"],
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(created.scope).toBe("OUTPUT");

    const updated = await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: created.id,
      type: "REGEX",
      name: "Output email redaction",
      action: "REDACT",
      scope: "ENTIRE_INPUT_AND_OUTPUT",
      redactionLabel: "[EMAIL]",
      presets: ["email"],
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(updated.scope).toBe("ENTIRE_INPUT_AND_OUTPUT");

    // Omitting scope on update preserves the stored scope value instead of resetting to LAST_TURN.
    const renamedWithoutScope = await ownerCaller.aiGateway.guardrails.update({
      orgId,
      id: created.id,
      type: "REGEX",
      name: "Output email redaction renamed",
      action: "REDACT",
      redactionLabel: "[EMAIL]",
      presets: ["email"],
      assignments: [{ scope: "API_KEY", apiKeyId: keyId }],
    });
    expect(renamedWithoutScope.scope).toBe("ENTIRE_INPUT_AND_OUTPUT");

    const resolved = await new GatewayGuardrailService(prisma).resolveForKey({
      organizationId: orgId,
      apiKeyId: keyId,
      userId: owner.id,
    });
    expect(resolved).toEqual([
      expect.objectContaining({
        id: created.id,
        type: "regex",
        action: "redact",
        scope: "entire_input_and_output",
        redaction_label: "[EMAIL]",
      }),
    ]);
  });
});
