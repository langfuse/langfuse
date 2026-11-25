import { prisma } from "../../../src/db";
import { OrganizationId, SystemRoleId } from "../../../src/features/rbac/types";
import { createApiKey } from "../../../src/server";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";

/**
 * AI Gateway guardrails for the project's organization: an organization-wide
 * guardrail that logs emails, and one that blocks SSNs and card numbers on a
 * seeded gateway key. Prints the key so a request through the local gateway
 * shows both actions.
 */

const GUARDRAILS = [
  {
    name: "Log emails",
    action: "LOG",
    presets: ["email"],
    scope: "ORGANIZATION",
  },
  {
    name: "Block SSNs and card numbers",
    action: "BLOCK",
    presets: ["us_ssn", "credit_card"],
    scope: "API_KEY",
  },
] as const;

const ensureGatewayKey = async (params: {
  organizationId: string;
  publicKey: string;
  secretKey: string;
}) => {
  const found = await prisma.apiKey.findUnique({
    where: { publicKey: params.publicKey },
    select: { id: true, orgId: true },
  });
  if (found && found.orgId !== params.organizationId) {
    throw new SeedError(
      `Seeded gateway key ${params.publicKey} belongs to another organization`,
      "pass a different --id-prefix",
    );
  }
  const id =
    found?.id ??
    (
      await createApiKey(prisma, {
        tenant: OrganizationId(params.organizationId),
        scope: OrganizationId(params.organizationId),
        role: SystemRoleId("AI_GATEWAY_INFERENCE"),
        createdBy: "system",
        name: "Guardrails demo",
        predefinedKeys: {
          publicKey: params.publicKey,
          secretKey: params.secretKey,
        },
      })
    ).id;
  await prisma.gatewayApiKeyAssociation.upsert({
    where: { apiKeyId: id },
    create: { apiKeyId: id },
    update: {},
  });
  return id;
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const project = await prisma.project.findUnique({
    where: { id: ctx.projectId },
    select: { orgId: true },
  });
  if (!project) {
    throw new SeedError(
      `Project ${ctx.projectId} not found`,
      "run `pnpm run dx` or pass --project-id of an existing project",
    );
  }
  const organizationId = project.orgId;
  const keyMaterial = `${ctx.idPrefix}-${organizationId}-guardrails`;
  const secretKey = `sk-lf-gateway-${keyMaterial}`;
  const summary = {
    scenario: "gateway-guardrails",
    target: "clickhouse" as const,
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts: { guardrails: GUARDRAILS.length, assignments: GUARDRAILS.length },
    links: [`${ctx.baseUrl}/organization/${organizationId}/ai-gateway`],
  };
  if (ctx.dryRun) {
    return {
      ...summary,
      verified: {},
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const apiKeyId = await ensureGatewayKey({
    organizationId,
    publicKey: `pk-lf-gateway-${keyMaterial}`,
    secretKey,
  });
  const guardrailIds: string[] = [];
  for (const guardrail of GUARDRAILS) {
    const name = `${guardrail.name} (${ctx.idPrefix})`;
    const { id } = await prisma.gatewayGuardrail.upsert({
      where: { organizationId_name: { organizationId, name } },
      create: {
        organizationId,
        name,
        action: guardrail.action,
        config: { presets: [...guardrail.presets] },
      },
      update: {
        action: guardrail.action,
        config: { presets: [...guardrail.presets] },
      },
      select: { id: true },
    });
    guardrailIds.push(id);
    // Replaced on every run, so a rerun leaves exactly one assignment per guardrail.
    await prisma.gatewayGuardrailAssignment.deleteMany({
      where: { guardrailId: id },
    });
    await prisma.gatewayGuardrailAssignment.create({
      data: {
        guardrailId: id,
        organizationId,
        scope: guardrail.scope,
        apiKeyId: guardrail.scope === "API_KEY" ? apiKeyId : null,
      },
    });
  }

  const verified = {
    guardrails: await prisma.gatewayGuardrail.count({
      where: { id: { in: guardrailIds } },
    }),
    assignments: await prisma.gatewayGuardrailAssignment.count({
      where: { guardrailId: { in: guardrailIds } },
    }),
  };
  for (const [entity, count] of Object.entries(verified)) {
    if (count !== GUARDRAILS.length) {
      throw new SeedError(
        `Readback mismatch: expected ${GUARDRAILS.length} ${entity}, found ${count}`,
      );
    }
  }
  ctx.log(
    `Gateway key with both guardrails: ${secretKey}. Web caches each key's resolved context for LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_TTL_SECONDS, so changed guardrails apply to a key already used once its entry expires.`,
  );
  return {
    ...summary,
    verified,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const gatewayGuardrailsScenario: ScenarioDefinition = {
  name: "gateway-guardrails",
  description:
    "AI Gateway guardrails in the project's organization: an organization-wide guardrail that logs emails and one that blocks SSNs and card numbers on a seeded gateway key, whose secret key the run prints. Writes Postgres only.",
  supportsV4: false,
  flags: [],
  run,
};
