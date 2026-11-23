import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { afterAll, describe, expect, it } from "vitest";

import { GatewayGuardrailService } from "@/src/features/ai-gateway/server/guardrails/gatewayGuardrailService";
import { GATEWAY_GUARDRAIL_PRESETS } from "@/src/features/ai-gateway/types/gatewayGuardrail";

const organizationIds: string[] = [];
const userIds: string[] = [];

const createOrganization = async () => {
  const organization = await prisma.organization.create({
    data: { id: randomUUID(), name: "Guardrails test" },
  });
  organizationIds.push(organization.id);
  return organization.id;
};

const createUser = async () => {
  const user = await prisma.user.create({
    data: { email: `guardrails-${randomUUID()}@example.com` },
  });
  userIds.push(user.id);
  return user.id;
};

const createKey = async (orgId: string, userId: string | null) => {
  const { id } = await createApiKey(prisma, {
    tenant: OrganizationId(orgId),
    scope: userId ? UserId(userId) : OrganizationId(orgId),
    role: SystemRoleId("AI_GATEWAY_INFERENCE"),
    createdBy: "system",
  });
  return id;
};

const createGuardrail = async (params: {
  organizationId: string;
  name: string;
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
      action: "BLOCK",
      config: params.config ?? { presets: ["email"] },
      assignments: {
        create: params.assignments.map((assignment) => ({
          ...assignment,
          organizationId: params.organizationId,
        })),
      },
    },
  });

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: organizationIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("GatewayGuardrailService", () => {
  it("resolves the organization's, the key's and its user's guardrails, each once", async () => {
    const organizationId = await createOrganization();
    const otherOrganizationId = await createOrganization();
    const user = await createUser();
    const otherUser = await createUser();
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
