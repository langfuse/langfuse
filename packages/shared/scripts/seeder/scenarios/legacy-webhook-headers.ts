import { JobConfigState, prisma } from "../../../src/db";
import { encrypt, generateWebhookSecret } from "../../../src/encryption";
import {
  createDisplayHeaders,
  encryptSecretHeaders,
} from "../../../src/server";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";

// ---------------------------------------------------------------------------
// Webhook automations whose action config still carries the deprecated
// plaintext `config.headers` map — the shape written before headers had a
// secret flag. Rows in this shape only exist on instances that created a
// webhook in that window and never saved it since, so this scenario is the
// cheap way to get them back. Three variants:
//
//  - LEGACY ONLY: every header lives in `headers`.
//  - OVERRIDDEN: `requestHeaders` sets the same key as `headers`; the
//    `requestHeaders` value wins and the stale legacy value must never surface.
//  - MIXED: a legacy header next to an unrelated non-secret `requestHeaders`
//    entry, which must stay readable.
//
// All header values are synthetic. Re-running resets each action to its
// legacy shape, so the encryption backfill can be exercised repeatedly.
// ---------------------------------------------------------------------------

const BACKGROUND_MIGRATION_NAME = "20261022_encrypt_legacy_webhook_headers";

type RequestHeader = { secret: boolean; value: string };

type Variant = {
  key: string;
  name: string;
  headers: Record<string, string>;
  requestHeaders: Record<string, RequestHeader>;
};

const variantsFor = (ctx: ScenarioContext): Variant[] => [
  {
    key: "legacy-only",
    name: "Legacy headers only",
    headers: {
      Authorization: `Bearer seed-legacy-token-${ctx.idPrefix}`,
      "X-Seed-Tenant": "synthetic-tenant",
    },
    requestHeaders: {},
  },
  {
    key: "overridden",
    name: "Legacy header overridden by requestHeaders",
    // Masks to "Bear...tale", distinct from the winning "Bear...oken".
    headers: { Authorization: "Bearer seed-legacy-stale" },
    requestHeaders: {
      Authorization: { secret: true, value: "Bearer seed-current-token" },
    },
  },
  {
    key: "mixed",
    name: "Legacy header next to a public header",
    headers: { "X-Seed-Legacy-Key": "seed-legacy-key-value" },
    requestHeaders: { "X-Seed-Env": { secret: false, value: "preview" } },
  },
];

const idsFor = (ctx: ScenarioContext, variant: Variant) => {
  const base = `${ctx.idPrefix}-${variant.key}`;
  return {
    triggerId: `${base}-trigger`,
    actionId: `${base}-action`,
    automationId: `${base}-automation`,
  };
};

const automationLink = (ctx: ScenarioContext, automationId: string) =>
  `${ctx.baseUrl}/project/${ctx.projectId}/automations?automationId=${automationId}`;

const legacyConfig = (
  variant: Variant,
  url: string,
  signingSecret: { secretKey: string; displaySecretKey: string },
) => ({
  type: "WEBHOOK",
  url,
  apiVersion: { prompt: "v1" },
  headers: variant.headers,
  requestHeaders: encryptSecretHeaders(variant.requestHeaders),
  displayHeaders: createDisplayHeaders(variant.requestHeaders),
  ...signingSecret,
});

/** Keeps an existing signing secret so a re-run does not invalidate it. */
const signingSecretFor = async (actionId: string) => {
  const existing = await prisma.action.findUnique({
    where: { id: actionId },
    select: { config: true },
  });
  const config = existing?.config as
    | { secretKey?: unknown; displaySecretKey?: unknown }
    | undefined;
  if (
    typeof config?.secretKey === "string" &&
    typeof config.displaySecretKey === "string"
  ) {
    return {
      secretKey: config.secretKey,
      displaySecretKey: config.displaySecretKey,
    };
  }
  const { secretKey, displaySecretKey } = generateWebhookSecret();
  return { secretKey: encrypt(secretKey), displaySecretKey };
};

const writeVariant = async (
  ctx: ScenarioContext,
  variant: Variant,
  url: string,
) => {
  const { triggerId, actionId, automationId } = idsFor(ctx, variant);
  const config = legacyConfig(variant, url, await signingSecretFor(actionId));
  const trigger = {
    projectId: ctx.projectId,
    eventSource: "prompt",
    eventActions: ["created"],
    filter: [],
    status: JobConfigState.ACTIVE,
  };
  const automation = {
    projectId: ctx.projectId,
    name: `[seed] ${variant.name}`,
    triggerId,
    actionId,
  };

  await prisma.$transaction([
    prisma.trigger.upsert({
      where: { id: triggerId },
      create: { id: triggerId, ...trigger },
      update: trigger,
    }),
    prisma.action.upsert({
      where: { id: actionId },
      create: {
        id: actionId,
        projectId: ctx.projectId,
        type: "WEBHOOK",
        config,
      },
      update: { config },
    }),
    prisma.automation.upsert({
      where: { id: automationId },
      create: { id: automationId, ...automation },
      update: automation,
    }),
  ]);
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const url = String(params.url);
  const rerunBackfill = params["rerun-backfill"] === true;
  const variants = variantsFor(ctx);
  const ids = variants.map((variant) => idsFor(ctx, variant));
  const links = [
    `${ctx.baseUrl}/project/${ctx.projectId}/automations`,
    ...ids.map(({ automationId }) => automationLink(ctx, automationId)),
  ];
  const counts = {
    automations: variants.length,
    legacyHeaders: variants.reduce(
      (sum, variant) => sum + Object.keys(variant.headers).length,
      0,
    ),
    backfillRequeued: rerunBackfill ? 1 : 0,
  };
  const summary: SeedSummary = {
    scenario: "legacy-webhook-headers",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts,
    verified: {},
    links,
    dryRun: ctx.dryRun,
    durationMs: 0,
  };
  if (ctx.dryRun) {
    return { ...summary, durationMs: Date.now() - startedAt };
  }

  ctx.log(`writing ${variants.length} webhook automations with legacy headers`);
  for (const variant of variants) {
    await writeVariant(ctx, variant, url);
  }

  if (rerunBackfill) {
    const { count } = await prisma.backgroundMigration.updateMany({
      where: { name: BACKGROUND_MIGRATION_NAME },
      data: {
        finishedAt: null,
        failedAt: null,
        failedReason: null,
        lockedAt: null,
      },
    });
    if (count !== 1) {
      throw new SeedError(
        `Background migration ${BACKGROUND_MIGRATION_NAME} is not registered`,
        "apply the Prisma migrations of the branch that adds it, then re-run",
      );
    }
    ctx.log(
      `re-queued ${BACKGROUND_MIGRATION_NAME}; restart the worker to run it`,
    );
  }

  const actions = await prisma.action.findMany({
    where: { id: { in: ids.map(({ actionId }) => actionId) } },
    select: { config: true },
  });
  const verified = {
    automations: await prisma.automation.count({
      where: { id: { in: ids.map(({ automationId }) => automationId) } },
    }),
    legacyHeaders: actions.reduce((sum, { config }) => {
      const headers = (config as { headers?: Record<string, string> }).headers;
      return sum + Object.keys(headers ?? {}).length;
    }, 0),
  };
  if (
    verified.automations < counts.automations ||
    verified.legacyHeaders < counts.legacyHeaders
  ) {
    throw new SeedError(
      `Readback mismatch: expected ${counts.automations} automations with ${counts.legacyHeaders} legacy headers, found ${verified.automations} with ${verified.legacyHeaders}`,
    );
  }

  return { ...summary, verified, durationMs: Date.now() - startedAt };
};

export const legacyWebhookHeadersScenario: ScenarioDefinition = {
  name: "legacy-webhook-headers",
  description:
    "Webhook automations whose action config still stores headers in the deprecated plaintext `config.headers` map: one legacy-only, one where requestHeaders overrides the legacy key, one next to a public header. Re-running resets them; --rerun-backfill re-queues the encryption background migration.",
  supportsV4: false,
  flags: [
    {
      flag: "url",
      type: "string",
      default: "https://example.com/langfuse-seed-webhook",
      description:
        "webhook URL; point it at a request inspector to see delivered headers",
    },
    {
      flag: "rerun-backfill",
      type: "boolean",
      default: false,
      description:
        "clear the finished state of the legacy header encryption background migration so the next worker start runs it again",
    },
  ],
  run,
};
