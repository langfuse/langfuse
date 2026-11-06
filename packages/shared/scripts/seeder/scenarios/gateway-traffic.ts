import { prisma, type Role } from "../../../src/db";
import { organizationRoleAccessRights } from "../../../src/features/rbac/organizationAccessRights";
import {
  OrganizationId,
  SystemRoleId,
  UserId,
} from "../../../src/features/rbac/types";
import {
  createApiKey,
  createEvent,
  createEventsCh,
  EventRecordInsertType,
} from "../../../src/server";
import {
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "../../../src/features/ai-gateway/constants";
import {
  AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME,
  AI_GATEWAY_KEY_ID_METADATA_KEY,
} from "../../../src/server/otel/OtelIngestionProcessor";
import { GEN_INPUT_PRICE, GEN_OUTPUT_PRICE } from "./payload";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, escapeLike } from "./verify";

/**
 * AI Gateway traffic in the organization's gateway ingestion project, built
 * for the AI Gateway analytics settings tab. Each request is one root
 * GENERATION event with the gateway service name, the gateway key id as its
 * ingestion API key, and the key's bound user as user ID and owner metadata,
 * the shape gateway ingestion writes. A few SDK events land in the same project; analytics must ignore
 * them.
 *
 * Writes go to the ingestion project of the --project's organization, not to
 * --project itself. Missing gateway keys are created (bound round-robin to
 * organization members whose role can invoke the gateway) until the
 * organization has --keys of them. One extra service key, bound to no user,
 * sends requests whose user ID the caller set.
 */

/** A `null` rate is a model without a Langfuse price: requests carry usage but no cost. */
const MODELS: ReadonlyArray<{ name: string; rate: number | null }> = [
  { name: "gpt-5.4-mini", rate: 1 },
  { name: "claude-haiku-4-5", rate: 1.5 },
  { name: "gpt-5.6-sol", rate: 6 },
  { name: "self-hosted-llama", rate: null },
];

const SDK_EVENTS_PER_DAY = 3;

// The gateway rejects keys whose owner's organization role cannot invoke it.
const GATEWAY_INVOKER_ROLES = (
  Object.keys(organizationRoleAccessRights) as Role[]
).filter((role) =>
  organizationRoleAccessRights[role].includes("gateway:invoke"),
);

const ensureGatewayKeys = async (params: {
  organizationId: string;
  keyCount: number;
  idPrefix: string;
}) => {
  const existing = await prisma.gatewayApiKeyAssociation.findMany({
    where: {
      apiKey: {
        orgId: params.organizationId,
        scope: "ORGANIZATION",
        userId: { not: null },
      },
    },
    select: { apiKey: { select: { id: true, userId: true } } },
    orderBy: { apiKeyId: "asc" },
  });
  const keys = existing.map(({ apiKey }) => apiKey);
  if (keys.length >= params.keyCount) return keys;

  const members = await prisma.organizationMembership.findMany({
    where: {
      orgId: params.organizationId,
      role: { in: GATEWAY_INVOKER_ROLES },
    },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  if (members.length === 0) {
    throw new SeedError(
      "The gateway organization has no members that can invoke the gateway to bind keys to",
      "run `pnpm run dx` to seed the default organization and its members",
    );
  }

  for (let i = keys.length; i < params.keyCount; i++) {
    const userId = members[i % members.length].userId;
    const keyMaterial = `${params.idPrefix}-${params.organizationId}-${i}`;
    const publicKey = `pk-lf-gateway-${keyMaterial}`;
    const found = await prisma.apiKey.findUnique({
      where: { publicKey },
      select: { id: true, userId: true, orgId: true },
    });
    if (found && found.orgId !== params.organizationId) {
      throw new SeedError(
        `Seeded gateway key ${publicKey} belongs to another organization`,
        "pass a different --id-prefix",
      );
    }
    const key: { id: string; userId: string | null } = found ?? {
      id: (
        await createApiKey(prisma, {
          tenant: OrganizationId(params.organizationId),
          scope: UserId(userId),
          role: SystemRoleId("AI_GATEWAY"),
          createdBy: UserId(userId),
          name: `Seeded team key ${i}`,
          predefinedKeys: {
            publicKey,
            secretKey: `sk-lf-gateway-${keyMaterial}`,
          },
        })
      ).id,
      userId,
    };
    await prisma.gatewayApiKeyAssociation.upsert({
      where: { apiKeyId: key.id },
      create: { apiKeyId: key.id, metadata: { team: `team-${i}` } },
      update: {},
    });
    keys.push(key);
  }
  return keys;
};

/** A key issued to no user, as the gateway's service-account keys are. */
const ensureServiceKey = async (params: {
  organizationId: string;
  idPrefix: string;
}) => {
  const keyMaterial = `${params.idPrefix}-${params.organizationId}-service`;
  const publicKey = `pk-lf-gateway-${keyMaterial}`;
  const found = await prisma.apiKey.findUnique({
    where: { publicKey },
    select: { id: true, orgId: true },
  });
  if (found && found.orgId !== params.organizationId) {
    throw new SeedError(
      `Seeded gateway key ${publicKey} belongs to another organization`,
      "pass a different --id-prefix",
    );
  }
  const id =
    found?.id ??
    (
      await createApiKey(prisma, {
        tenant: OrganizationId(params.organizationId),
        scope: OrganizationId(params.organizationId),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy: "system",
        name: "Seeded service key",
        predefinedKeys: {
          publicKey,
          secretKey: `sk-lf-gateway-${keyMaterial}`,
        },
      })
    ).id;
  await prisma.gatewayApiKeyAssociation.upsert({
    where: { apiKeyId: id },
    create: { apiKeyId: id, metadata: { team: "service" } },
    update: {},
  });
  return { id, userId: null };
};

const generationCost = (
  usageInput: number,
  usageOutput: number,
  rate: number | null,
) => {
  const usage = {
    input: usageInput,
    output: usageOutput,
    total: usageInput + usageOutput,
  };
  if (rate === null) {
    return {
      provided_usage_details: usage,
      usage_details: usage,
      provided_cost_details: {},
      cost_details: {},
    };
  }
  const inputCost = usageInput * GEN_INPUT_PRICE * rate;
  const outputCost = usageOutput * GEN_OUTPUT_PRICE * rate;
  const cost = {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  };
  return {
    provided_usage_details: usage,
    usage_details: usage,
    provided_cost_details: cost,
    cost_details: cost,
  };
};

const toGenerationEvent = (params: {
  projectId: string;
  environment: string;
  id: string;
  name: string;
  userId: string | null;
  gatewayKeyId: string | null;
  keyOwnerUserId: string | null;
  model: (typeof MODELS)[number];
  usageInput: number;
  usageOutput: number;
  startTime: number;
  durationMs: number;
}): EventRecordInsertType => {
  const metadata: Record<string, string> = params.gatewayKeyId
    ? {
        [AI_GATEWAY_KEY_ID_METADATA_KEY]: params.gatewayKeyId,
        ...(params.keyOwnerUserId
          ? {
              [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY]:
                params.keyOwnerUserId,
            }
          : {}),
      }
    : { scenario: "gateway-traffic" };
  const metadataNames = Object.keys(metadata).sort();
  return createEvent({
    project_id: params.projectId,
    trace_id: params.id,
    span_id: params.id,
    id: params.id,
    parent_span_id: "",
    is_app_root: true,
    name: params.name,
    trace_name: params.name,
    type: "GENERATION",
    environment: params.environment,
    level: "DEFAULT",
    status_message: null,
    version: null,
    release: null,
    tags: [],
    user_id: params.userId,
    session_id: null,
    public: false,
    bookmarked: false,
    input: JSON.stringify({
      messages: [{ role: "user", content: params.name }],
    }),
    output: "Seeded completion",
    provided_model_name: params.model.name,
    model_id: null,
    model_parameters: "{}",
    ...generationCost(params.usageInput, params.usageOutput, params.model.rate),
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,
    metadata_names: metadataNames,
    metadata_values: metadataNames.map((name) => metadata[name]),
    ...(params.gatewayKeyId
      ? {
          ingestion_api_key: params.gatewayKeyId,
          service_name: AI_GATEWAY_SERVICE_NAME,
          scope_name: AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME,
        }
      : {}),
    start_time: params.startTime,
    end_time: params.startTime + params.durationMs,
    completion_start_time: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    event_bytes: 0,
    source: "otel",
  });
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const days = params["days"] as number;
  const requestsPerDay = params["requests-per-day"] as number;
  const keyCount = params["keys"] as number;

  if (days < 1 || days > 366) {
    throw new SeedError(
      `--days must be between 1 and 366, got ${days}`,
      "pass the window the analytics should cover, e.g. --days 30",
    );
  }
  if (requestsPerDay < 1 || keyCount < 1) {
    throw new SeedError(
      "--requests-per-day and --keys must be >= 1",
      "pass positive values, e.g. --requests-per-day 40 --keys 4",
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: ctx.projectId },
    select: {
      orgId: true,
      organization: {
        select: {
          gatewayConfig: { select: { defaultIngestionProjectId: true } },
        },
      },
    },
  });
  const ingestionProjectId =
    project?.organization.gatewayConfig?.defaultIngestionProjectId;
  if (!project || !ingestionProjectId) {
    throw new SeedError(
      `No AI Gateway ingestion project for the organization of project ${ctx.projectId}`,
      "run `pnpm run dx` (it seeds the gateway config) or pick an ingestion project in Organization settings > AI Gateway > Setup",
    );
  }

  const gatewayEvents = days * requestsPerDay;
  const sdkEvents = days * SDK_EVENTS_PER_DAY;
  const counts = {
    gatewayEvents,
    sdkEvents,
    events: gatewayEvents + sdkEvents,
  };
  const links = [
    `${ctx.baseUrl}/organization/${project.orgId}/settings/ai-gateway-analytics`,
  ];
  const summary = {
    scenario: "gateway-traffic",
    target: "clickhouse" as const,
    params,
    projectId: ingestionProjectId,
    environment: ctx.environment,
    traceIds: Array.from(
      { length: Math.min(requestsPerDay, 5) },
      (_, i) => `${ctx.idPrefix}-d1-r${i}`,
    ),
    sessionIds: [],
    counts,
    links,
  };

  if (ctx.dryRun) {
    return {
      ...summary,
      verified: {},
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const keys = [
    await ensureServiceKey({
      organizationId: project.orgId,
      idPrefix: ctx.idPrefix,
    }),
    ...(await ensureGatewayKeys({
      organizationId: project.orgId,
      keyCount,
      idPrefix: ctx.idPrefix,
    })),
  ];
  ctx.log(
    `building ${gatewayEvents} gateway requests over ${days} day(s) across ${keys.length} key(s)`,
  );

  const dayStartToday = utcDayStartMs();
  const events: EventRecordInsertType[] = [];
  for (let d = 1; d <= days; d++) {
    const dayStart = dayStartToday - d * 86_400_000;
    for (let i = 0; i < requestsPerDay + SDK_EVENTS_PER_DAY; i++) {
      const isGateway = i < requestsPerDay;
      const row = isGateway ? i : i - requestsPerDay;
      // Keyed by (day, kind, row) only: start_time is in the events ORDER BY,
      // so it must not shift when --requests-per-day changes.
      const g = (d * 2 + (isGateway ? 0 : 1)) * 1_000_000 + row;
      // sqrt of a uniform pick skews toward later keys, so the per-key and
      // per-user bars differ in length.
      const key =
        keys[
          Math.floor(
            Math.sqrt(jitter(ctx.seed, g * 7 + 1, keys.length ** 2 - 1)),
          )
        ];
      events.push(
        toGenerationEvent({
          projectId: ingestionProjectId,
          environment: ctx.environment,
          id: isGateway
            ? `${ctx.idPrefix}-d${d}-r${row}`
            : `${ctx.idPrefix}-d${d}-sdk${row}`,
          name: isGateway ? "chat.completions" : "sdk-generation",
          // A service key's caller sets the user ID itself.
          userId: isGateway
            ? (key.userId ?? `app-user-${jitter(ctx.seed, g * 29 + 7, 2)}`)
            : "sdk-user",
          gatewayKeyId: isGateway ? key.id : null,
          keyOwnerUserId: isGateway ? key.userId : null,
          model: MODELS[jitter(ctx.seed, g * 11 + 2, MODELS.length - 1)],
          usageInput: 300 + jitter(ctx.seed, g * 13 + 3, 4000),
          usageOutput: 100 + jitter(ctx.seed, g * 17 + 4, 1500),
          startTime: dayStart + jitter(ctx.seed, g * 19 + 5, 86_399_000),
          durationMs: 400 + jitter(ctx.seed, g * 23 + 6, 3000),
        }),
      );
    }
  }

  ctx.log(`inserting ${events.length} events`);
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  const verified = {
    events: await countRows(
      "events_core",
      `project_id = {projectId: String} AND trace_id LIKE {prefix: String} AND is_deleted = 0`,
      {
        projectId: ingestionProjectId,
        prefix: `${escapeLike(ctx.idPrefix)}-d%`,
      },
      "uniqExact(span_id)",
    ),
  };
  // Exact, because rows left by an earlier run with more --days or
  // --requests-per-day under the same prefix would inflate the analytics.
  if (verified.events !== counts.events) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.events} events, found ${verified.events}`,
      verified.events > counts.events
        ? "an earlier run with larger --days or --requests-per-day left rows under this prefix; pass a fresh --id-prefix"
        : undefined,
    );
  }

  return {
    ...summary,
    verified,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const gatewayTrafficScenario: ScenarioDefinition = {
  name: "gateway-traffic",
  description:
    "AI Gateway requests in the organization's gateway ingestion project: one GENERATION per request attributed to the gateway service, its gateway key, and the key's user, plus a few SDK events. One model has no price, so its requests carry usage but no cost. Creates gateway keys up to --keys, plus one service key bound to no user. Built for the AI Gateway analytics settings tab.",
  supportsV4: true,
  flags: [
    {
      flag: "days",
      type: "number",
      default: 30,
      description: "spread requests over the past N days (starting yesterday)",
    },
    {
      flag: "requests-per-day",
      type: "number",
      default: 40,
      description: "gateway requests per day",
    },
    {
      flag: "keys",
      type: "number",
      default: 4,
      description:
        "gateway keys to spread requests over (missing ones are created)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "check the v4 events tables before writing (the scenario only writes events)",
    },
  ],
  run,
};
