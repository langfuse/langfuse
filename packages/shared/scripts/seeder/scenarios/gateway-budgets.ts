import { prisma, type GatewaySpendLimitInterval } from "../../../src/db";
import {
  OrganizationId,
  SystemRoleId,
  UserId,
} from "../../../src/features/rbac/types";
import {
  createApiKey,
  createEventsCh,
  EventRecordInsertType,
} from "../../../src/server";
import { findOrCreateOrgMembership } from "../../../src/features/memberships/orgMembershipRepository";
import { GATEWAY_MODELS, toGatewayGenerationEvent } from "./gateway-traffic";
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
 * AI Gateway spend for the Budgets page, in the organization's gateway
 * ingestion project. Adds --users gateway-only members, one gateway key each
 * plus a service key bound to no user, and spreads requests over the past
 * --days with a growth trend, quiet weekends and a few heavy users, so daily,
 * weekly and monthly spend all differ. A handful of the busiest keys and
 * users get spend limits sized from their seeded spend, from barely used to
 * over the limit, and the organization gets a limit sized from all of it.
 */

const DAY_MS = 86_400_000;

const FIRST_NAMES = [
  "Ada",
  "Ben",
  "Chloe",
  "Diego",
  "Elena",
  "Farid",
  "Grace",
  "Hiro",
  "Isla",
  "Jonas",
  "Kira",
  "Liam",
  "Maya",
  "Nils",
  "Olivia",
  "Priya",
  "Quentin",
  "Rosa",
  "Sami",
  "Tara",
  "Umar",
  "Vera",
  "Wen",
  "Ximena",
  "Yusuf",
  "Zoe",
];

const LAST_NAMES = [
  "Andersen",
  "Brooks",
  "Costa",
  "Dubois",
  "Eriksen",
  "Fischer",
  "Garcia",
  "Hoffmann",
  "Ito",
  "Jansen",
  "Kowalski",
  "Larsen",
  "Moreau",
  "Novak",
  "Okafor",
  "Petrov",
  "Rossi",
  "Schmidt",
  "Tanaka",
  "Weber",
];

const KEY_PURPOSES = [
  "Claude Code",
  "Codex CLI",
  "Cursor",
  "Eval runner",
  "Notebook",
  "Support bot",
];

/** Limits on the busiest keys by rank, each sized so its current window shows `usage` of the limit. */
const BUDGETS: ReadonlyArray<{
  rank: number;
  interval: GatewaySpendLimitInterval;
  usage: number;
}> = [
  { rank: 0, interval: "TOTAL", usage: 1.12 },
  { rank: 1, interval: "MONTHLY", usage: 0.94 },
  { rank: 2, interval: "TOTAL", usage: 0.55 },
  { rank: 4, interval: "WEEKLY", usage: 0.3 },
  { rank: 7, interval: "TOTAL", usage: 0.08 },
];

/** Limits on the busiest users by rank, on users whose key has no limit of its own. */
const USER_BUDGETS: ReadonlyArray<{
  rank: number;
  interval: GatewaySpendLimitInterval;
  usage: number;
}> = [
  { rank: 3, interval: "MONTHLY", usage: 1.25 },
  { rank: 5, interval: "WEEKLY", usage: 0.6 },
  { rank: 8, interval: "TOTAL", usage: 0.2 },
];

/** The organization's own limit, sized from all seeded spend in its window. */
const ORGANIZATION_BUDGET: {
  interval: GatewaySpendLimitInterval;
  usage: number;
} = { interval: "MONTHLY", usage: 0.92 };

/** Limit for a key whose window has no spend yet, e.g. on the first day of a month. */
const FALLBACK_LIMIT_USD = 100;

/** Whole dollars, or cents for small limits such as a weekly one early in the week. */
const roundUpLimit = (usd: number) =>
  usd >= 20 ? Math.ceil(usd) : Math.ceil(usd * 100) / 100;

// The service key's traffic ranks it between the second and third user.
const SERVICE_KEY_WEIGHT = 0.4;

type SeededKey = { id: string; userId: string | null; weight: number };

const seededUser = (index: number) => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[(index * 7) % LAST_NAMES.length];
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}.${index}@example.com`.toLowerCase(),
    keyName: `${first}'s ${KEY_PURPOSES[index % KEY_PURPOSES.length]}`,
  };
};

const requestsOnDay = (params: {
  dayStart: number;
  daysAgo: number;
  days: number;
  requestsPerDay: number;
}) => {
  const growth = 0.55 + (0.45 * (params.days - params.daysAgo)) / params.days;
  const weekday = new Date(params.dayStart).getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 0.4 : 1;
  return Math.max(1, Math.round(params.requestsPerDay * growth * weekend));
};

/** Mirrors the gateway's UTC calendar windows; weeks start on Monday. */
const windowStartMs = (interval: GatewaySpendLimitInterval, now: Date) => {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  switch (interval) {
    case "DAILY":
      return midnight;
    case "WEEKLY":
      return midnight - ((now.getUTCDay() + 6) % 7) * DAY_MS;
    case "MONTHLY":
      return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    case "TOTAL":
      return 0;
  }
};

const ensureKey = async (params: {
  organizationId: string;
  publicKey: string;
  secretKey: string;
  name: string;
  userId: string | null;
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
        scope: params.userId
          ? UserId(params.userId)
          : OrganizationId(params.organizationId),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy: params.userId ? UserId(params.userId) : "system",
        name: params.name,
        predefinedKeys: {
          publicKey: params.publicKey,
          secretKey: params.secretKey,
        },
      })
    ).id;
  await prisma.gatewayApiKeyAssociation.upsert({
    where: { apiKeyId: id },
    create: { apiKeyId: id, metadata: { team: "budgets-demo" } },
    update: {},
  });
  return id;
};

const ensureUsersAndKeys = async (params: {
  organizationId: string;
  userCount: number;
  idPrefix: string;
}): Promise<SeededKey[]> => {
  const keyMaterial = (suffix: string) =>
    `${params.idPrefix}-${params.organizationId}-${suffix}`;
  const keys: SeededKey[] = [
    {
      id: await ensureKey({
        organizationId: params.organizationId,
        publicKey: `pk-lf-gateway-${keyMaterial("service")}`,
        secretKey: `sk-lf-gateway-${keyMaterial("service")}`,
        name: "Support bot (service)",
        userId: null,
      }),
      userId: null,
      weight: SERVICE_KEY_WEIGHT,
    },
  ];
  for (let i = 0; i < params.userCount; i++) {
    const seeded = seededUser(i);
    const user = await prisma.user.upsert({
      where: { email: seeded.email },
      create: { email: seeded.email, name: seeded.name },
      update: {},
      select: { id: true },
    });
    // Gateway keys are authorized by the member's role assignments, not the membership row alone.
    await findOrCreateOrgMembership(prisma, {
      orgId: params.organizationId,
      userId: user.id,
      role: "AI_GATEWAY",
    });
    keys.push({
      id: await ensureKey({
        organizationId: params.organizationId,
        publicKey: `pk-lf-gateway-${keyMaterial(`u${i}`)}`,
        secretKey: `sk-lf-gateway-${keyMaterial(`u${i}`)}`,
        name: seeded.keyName,
        userId: user.id,
      }),
      userId: user.id,
      // A few heavy users and a long tail, so per-user spend spans orders of magnitude.
      weight: 1 / (i + 1) ** 0.9,
    });
  }
  return keys;
};

const pickKey = (keys: SeededKey[], totalWeight: number, roll: number) => {
  let remaining = (roll / 1_000_000) * totalWeight;
  for (const key of keys) {
    remaining -= key.weight;
    if (remaining < 0) return key;
  }
  return keys[keys.length - 1];
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const days = params["days"] as number;
  const requestsPerDay = params["requests-per-day"] as number;
  const userCount = params["users"] as number;

  if (days < 7 || days > 366) {
    throw new SeedError(
      `--days must be between 7 and 366, got ${days}`,
      "pass the window the Budgets page should cover, e.g. --days 90",
    );
  }
  const minUsers = BUDGETS.length + USER_BUDGETS.length + 2;
  if (requestsPerDay < 1 || userCount < minUsers) {
    throw new SeedError(
      `--requests-per-day must be >= 1 and --users >= ${minUsers}`,
      "pass e.g. --requests-per-day 300 --users 36",
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

  const dayStartToday = utcDayStartMs();
  const dailyRequests = Array.from({ length: days }, (_, i) =>
    requestsOnDay({
      dayStart: dayStartToday - (i + 1) * DAY_MS,
      daysAgo: i + 1,
      days,
      requestsPerDay,
    }),
  );
  const events = dailyRequests.reduce((sum, count) => sum + count, 0);
  const summary = {
    scenario: "gateway-budgets",
    target: "clickhouse" as const,
    params,
    projectId: ingestionProjectId,
    environment: ctx.environment,
    traceIds: Array.from(
      { length: Math.min(dailyRequests[0], 5) },
      (_, i) => `${ctx.idPrefix}-d1-r${i}`,
    ),
    sessionIds: [],
    counts: {
      users: userCount,
      keys: userCount + 1,
      spendLimits: BUDGETS.length + USER_BUDGETS.length + 1,
      events,
    },
    links: [`${ctx.baseUrl}/organization/${project.orgId}/ai-gateway/budgets`],
  };

  if (ctx.dryRun) {
    return {
      ...summary,
      verified: {},
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const keys = await ensureUsersAndKeys({
    organizationId: project.orgId,
    userCount,
    idPrefix: ctx.idPrefix,
  });
  const totalWeight = keys.reduce((sum, key) => sum + key.weight, 0);
  ctx.log(
    `building ${events} gateway requests over ${days} day(s) across ${keys.length} key(s)`,
  );

  const rows: EventRecordInsertType[] = [];
  const spendRecords: Array<{
    keyId: string;
    startTime: number;
    costUsd: number;
  }> = [];
  for (let d = 1; d <= days; d++) {
    const dayStart = dayStartToday - d * DAY_MS;
    for (let row = 0; row < dailyRequests[d - 1]; row++) {
      // Keyed by (day, row) only: start_time is in the events ORDER BY.
      const g = d * 1_000_000 + row;
      const key = pickKey(
        keys,
        totalWeight,
        jitter(ctx.seed, g * 7 + 1, 999_999),
      );
      const startTime = dayStart + jitter(ctx.seed, g * 19 + 5, DAY_MS - 1_000);
      const event = toGatewayGenerationEvent({
        projectId: ingestionProjectId,
        environment: ctx.environment,
        id: `${ctx.idPrefix}-d${d}-r${row}`,
        name: "chat.completions",
        // A service key's caller sets the user ID itself.
        userId: key.userId ?? `app-user-${jitter(ctx.seed, g * 29 + 7, 9)}`,
        gatewayKeyId: key.id,
        keyOwnerUserId: key.userId,
        model:
          GATEWAY_MODELS[
            jitter(ctx.seed, g * 11 + 2, GATEWAY_MODELS.length - 1)
          ],
        usageInput: 500 + jitter(ctx.seed, g * 13 + 3, 12_000),
        usageOutput: 100 + jitter(ctx.seed, g * 17 + 4, 2_500),
        startTime,
        durationMs: 400 + jitter(ctx.seed, g * 23 + 6, 6_000),
      });
      rows.push(event);
      spendRecords.push({
        keyId: key.id,
        startTime,
        costUsd: event.cost_details?.total ?? 0,
      });
    }
  }

  ctx.log(`inserting ${rows.length} events`);
  for (const batch of chunk(rows, 500)) {
    await createEventsCh(batch);
  }

  const now = new Date();
  const limitUsdFor = (
    budget: { interval: GatewaySpendLimitInterval; usage: number },
    /** Undefined sizes the limit from every key's spend. */
    keyId: string | undefined,
  ) => {
    const since = windowStartMs(budget.interval, now);
    const spendUsd = spendRecords
      .filter((record) => keyId === undefined || record.keyId === keyId)
      .filter((record) => record.startTime >= since)
      .reduce((sum, record) => sum + record.costUsd, 0);
    return spendUsd > 0
      ? roundUpLimit(spendUsd / budget.usage)
      : FALLBACK_LIMIT_USD;
  };
  const userKeysByRank = keys
    .filter((key) => key.userId !== null)
    .toSorted((a, b) => b.weight - a.weight);
  const countingStartedAt = new Date(dayStartToday - (days + 1) * DAY_MS);
  for (const budget of BUDGETS) {
    const key = userKeysByRank[budget.rank];
    const limitUsd = limitUsdFor(budget, key.id);
    // The page shows a key's first limit only, so each key keeps exactly one.
    await prisma.gatewaySpendLimit.deleteMany({
      where: { apiKeyId: key.id, interval: { not: budget.interval } },
    });
    await prisma.gatewaySpendLimit.upsert({
      where: {
        apiKeyId_interval: { apiKeyId: key.id, interval: budget.interval },
      },
      create: {
        organizationId: project.orgId,
        scope: "API_KEY",
        apiKeyId: key.id,
        interval: budget.interval,
        limitUsd,
        countingStartedAt,
        ownerUserId: key.userId,
      },
      update: { limitUsd, countingStartedAt },
    });
  }

  // Each seeded user owns one key, so the user's spend is that key's spend.
  for (const budget of USER_BUDGETS) {
    const key = userKeysByRank[budget.rank];
    const userId = key.userId!;
    const limitUsd = limitUsdFor(budget, key.id);
    await prisma.gatewaySpendLimit.deleteMany({
      where: {
        organizationId: project.orgId,
        userId,
        interval: { not: budget.interval },
      },
    });
    await prisma.gatewaySpendLimit.upsert({
      where: {
        organizationId_userId_interval: {
          organizationId: project.orgId,
          userId,
          interval: budget.interval,
        },
      },
      create: {
        organizationId: project.orgId,
        scope: "USER",
        userId,
        interval: budget.interval,
        limitUsd,
        countingStartedAt,
      },
      update: { limitUsd, countingStartedAt },
    });
  }

  // One per organization by a partial unique index, which Prisma cannot upsert on.
  await prisma.gatewaySpendLimit.deleteMany({
    where: { organizationId: project.orgId, scope: "ORGANIZATION" },
  });
  await prisma.gatewaySpendLimit.create({
    data: {
      organizationId: project.orgId,
      scope: "ORGANIZATION",
      interval: ORGANIZATION_BUDGET.interval,
      limitUsd: limitUsdFor(ORGANIZATION_BUDGET, undefined),
      countingStartedAt,
    },
  });

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
    spendLimits: await prisma.gatewaySpendLimit.count({
      where: {
        OR: [
          {
            apiKeyId: {
              in: BUDGETS.map((budget) => userKeysByRank[budget.rank].id),
            },
          },
          {
            organizationId: project.orgId,
            userId: {
              in: USER_BUDGETS.map(
                (budget) => userKeysByRank[budget.rank].userId!,
              ),
            },
          },
          { organizationId: project.orgId, scope: "ORGANIZATION" },
        ],
      },
    }),
  };
  // Exact, because rows left by an earlier run with more --days or
  // --requests-per-day under the same prefix would inflate the spend.
  if (verified.events !== events) {
    throw new SeedError(
      `Readback mismatch: expected ${events} events, found ${verified.events}`,
      verified.events > events
        ? "an earlier run with larger --days or --requests-per-day left rows under this prefix; pass a fresh --id-prefix"
        : undefined,
    );
  }
  if (verified.spendLimits !== summary.counts.spendLimits) {
    throw new SeedError(
      `Readback mismatch: expected ${summary.counts.spendLimits} spend limits, found ${verified.spendLimits}`,
    );
  }

  return {
    ...summary,
    verified,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const gatewayBudgetsScenario: ScenarioDefinition = {
  name: "gateway-budgets",
  description:
    "AI Gateway spend for the Budgets page in the organization's gateway ingestion project: --users gateway-only members with one gateway key each, plus a service key, and requests over the past --days with a growth trend and quiet weekends. Five of the busiest keys and three busy users get spend limits from barely used to over the limit. Runs as part of `pnpm run ch:seed`.",
  supportsV4: true,
  flags: [
    {
      flag: "days",
      type: "number",
      default: 90,
      description: "spread requests over the past N days (starting yesterday)",
    },
    {
      flag: "requests-per-day",
      type: "number",
      default: 300,
      description: "gateway requests on a weekday at the end of the window",
    },
    {
      flag: "users",
      type: "number",
      default: 36,
      description:
        "gateway-only members to add, each with one gateway key (missing ones are created)",
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
