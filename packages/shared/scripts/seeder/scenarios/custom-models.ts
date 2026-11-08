import { prisma } from "../../../src/db";
import {
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

// ---------------------------------------------------------------------------
// Project-level model definitions plus generations that reference them, so the
// model editor can be reached the way a user reaches it: from a generation in
// a trace. Three entry points are covered.
//
//  - LINKED, tiered: a realtime-style model priced per usage type with a
//    second, condition-gated tier. The generation's model badge links to the
//    model page, where Edit opens the tiered (accordion) editor. One usage
//    type is priced at exactly 0 — that price must survive a round trip.
//  - LINKED, single tier: an embedding model, one usage type. Edit opens the
//    simple (single-tier) editor.
//  - UNLINKED: a generation whose model name matches no definition. Its badge
//    opens the CREATE dialog prefilled from the generation's usage details,
//    which is the path where submitting navigates away to the new model.
// ---------------------------------------------------------------------------

type TierDef = {
  name: string;
  isDefault: boolean;
  priority: number;
  conditions: {
    usageDetailPattern: string;
    operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
    value: number;
    caseSensitive: boolean;
  }[];
  prices: Record<string, number>;
};

type ModelDef = {
  key: string;
  modelName: string;
  tokenizerId: string | null;
  tiers: TierDef[];
  /** usage_details written on the generations that link to this model */
  usage: Record<string, number>;
};

type UsageStateFixture = {
  suffix: string;
  name: string;
  modelName: string;
  parentSuffix: string | null;
  level: "DEFAULT" | "ERROR";
  providedUsageDetails: Record<string, number>;
  usageDetails: Record<string, number>;
  providedCostDetails: Record<string, number>;
  costDetails: Record<string, number>;
  totalCost: number | null;
};

/**
 * Small, explicit usage shapes for reviewing the observation header. The
 * first row is a root GENERATION; the remaining rows are its children so the
 * same trace covers both direct and aggregated generation metrics.
 */
const USAGE_STATE_FIXTURES: UsageStateFixture[] = [
  {
    suffix: "usage-root",
    name: "usage-state-root-inferred",
    modelName: "seed-usage-state-inferred",
    parentSuffix: null,
    level: "DEFAULT",
    providedUsageDetails: {},
    usageDetails: { input: 120, output: 30, total: 150 },
    providedCostDetails: {},
    costDetails: { input: 0.0012, output: 0.0006, total: 0.0018 },
    totalCost: 0.0018,
  },
  {
    suffix: "usage-inferred",
    name: "usage-state-inferred-child",
    modelName: "seed-usage-state-inferred-child",
    parentSuffix: "usage-root",
    level: "DEFAULT",
    providedUsageDetails: {},
    usageDetails: { input: 80, output: 20, total: 100 },
    providedCostDetails: {},
    costDetails: { input: 0.0008, output: 0.0004, total: 0.0012 },
    totalCost: 0.0012,
  },
  {
    suffix: "usage-empty",
    name: "usage-state-empty",
    modelName: "seed-usage-state-empty",
    parentSuffix: "usage-root",
    level: "DEFAULT",
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    totalCost: null,
  },
  {
    suffix: "usage-zero",
    name: "usage-state-zero-usage",
    modelName: "seed-usage-state-zero-usage",
    parentSuffix: "usage-root",
    level: "DEFAULT",
    providedUsageDetails: { input: 0, output: 0, total: 0 },
    usageDetails: { input: 0, output: 0, total: 0 },
    providedCostDetails: {},
    costDetails: {},
    totalCost: null,
  },
  {
    suffix: "cost-zero",
    name: "usage-state-zero-cost",
    modelName: "seed-usage-state-zero-cost",
    parentSuffix: "usage-root",
    level: "DEFAULT",
    providedUsageDetails: { input: 10, output: 5, total: 15 },
    usageDetails: { input: 10, output: 5, total: 15 },
    providedCostDetails: { total: 0 },
    costDetails: { total: 0 },
    totalCost: 0,
  },
  {
    suffix: "usage-error",
    name: "usage-state-error-empty",
    modelName: "seed-usage-state-error",
    parentSuffix: "usage-root",
    level: "ERROR",
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    totalCost: null,
  },
];

const REALTIME_STANDARD_PRICES: Record<string, number> = {
  text_input: 0.000004,
  text_output: 0.000016,
  audio_input: 0.00004,
  audio_output: 0.00008,
  // Deliberately free: a zero price is a real price and must round-trip.
  text_input_cached: 0,
};

const MODELS: ModelDef[] = [
  {
    key: "realtime",
    modelName: "seed-realtime-2.1",
    tokenizerId: null,
    tiers: [
      {
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: REALTIME_STANDARD_PRICES,
      },
      {
        name: "Long context",
        isDefault: false,
        priority: 1,
        conditions: [
          {
            usageDetailPattern: "^text_input",
            operator: "gt",
            value: 128000,
            caseSensitive: false,
          },
        ],
        // Same usage types at double the price: renaming a usage type in the
        // default tier must not zero these out.
        prices: Object.fromEntries(
          Object.entries(REALTIME_STANDARD_PRICES).map(([type, price]) => [
            type,
            price * 2,
          ]),
        ),
      },
    ],
    usage: {
      text_input: 1840,
      text_output: 320,
      audio_input: 4400,
      audio_output: 1200,
      text_input_cached: 900,
      total: 8660,
    },
  },
  {
    key: "embed",
    modelName: "seed-embed-3-small",
    tokenizerId: null,
    tiers: [
      {
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: { input: 0.00000002 },
      },
    ],
    usage: { input: 512, total: 512 },
  },
];

/** Matches no definition, so its badge opens the create dialog. */
const UNPRICED_MODEL_NAME = "seed-unpriced-vision-1";
const UNPRICED_USAGE: Record<string, number> = {
  input: 900,
  image_input: 3,
  output: 210,
  total: 1113,
};

/**
 * A model's identity in Postgres is `(projectId, modelName, startDate, unit)`,
 * not an id we derive — so the derived id carries the project rather than
 * `--id-prefix`. With the prefix in it, seeding a second project would have
 * reassigned the first project's model row (orphaning its generations), and a
 * second prefix in one project would have hit the unique constraint instead of
 * resetting. Traces and observations still key off the prefix.
 */
const derivedModelId = (ctx: ScenarioContext, key: string) =>
  `model-${ctx.projectId}-${key}`;

const costFor = (
  usage: Record<string, number>,
  prices: Record<string, number>,
): Record<string, number> => {
  const costs = Object.fromEntries(
    Object.entries(usage)
      .filter(([type]) => type !== "total" && prices[type] !== undefined)
      .map(([type, units]) => [type, units * prices[type]]),
  );
  return {
    ...costs,
    total: Object.values(costs).reduce((sum, cost) => sum + cost, 0),
  };
};

/**
 * Re-seeding resets a model: tiers (and the prices that cascade from them) are
 * replaced wholesale, in one transaction so an interrupted run cannot leave a
 * model priced by nothing. Returns the id the row actually has.
 */
const writeModel = async (
  ctx: ScenarioContext,
  model: ModelDef,
): Promise<string> => {
  const modelRow = {
    projectId: ctx.projectId,
    modelName: model.modelName,
    matchPattern: `(?i)^(${model.modelName})$`,
    tokenizerId: model.tokenizerId,
    // The UI writes both so the (projectId, modelName, startDate, unit)
    // uniqueness constraint bites; match it or a UI save creates a twin.
    startDate: new Date("2010-01-01"),
    unit: "TOKENS",
  };
  // Whatever row already owns this name in this project wins, so a re-run
  // resets it instead of colliding with the constraint.
  const existing = await prisma.model.findFirst({
    where: { projectId: ctx.projectId, modelName: model.modelName },
    select: { id: true },
  });
  const id = existing?.id ?? derivedModelId(ctx, model.key);

  return prisma.$transaction(async (tx) => {
    await tx.model.upsert({
      where: { id },
      create: { id, ...modelRow },
      update: modelRow,
    });
    // Prices cascade from their tier, so deleting tiers clears both.
    await tx.pricingTier.deleteMany({ where: { modelId: id } });

    for (const tier of model.tiers) {
      const tierId = `tier-${id}-${tier.priority}`;
      await tx.pricingTier.create({
        data: {
          id: tierId,
          modelId: id,
          name: tier.name,
          isDefault: tier.isDefault,
          priority: tier.priority,
          conditions: tier.conditions,
        },
      });
      await tx.price.createMany({
        data: Object.entries(tier.prices).map(([usageType, price]) => ({
          id: `price-${tierId}-${usageType}`,
          modelId: id,
          projectId: ctx.projectId,
          pricingTierId: tierId,
          usageType,
          price,
        })),
      });
    }
    return id;
  });
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const withV4 = params.v4 === true;
  const withUsageStates = params["usage-states"] === true;
  const traceId = `${ctx.idPrefix}-t0`;
  // Anchored on today's UTC midnight, never the wall clock: these land in
  // ClickHouse ORDER BY keys and a re-run must overwrite in place.
  const traceTimestamp = utcDayStartMs() - 30 * 60 * 1000;

  const regularGenerationPlan = [
    ...MODELS.flatMap((model, index) => [
      { model, suffix: `${index}a`, fixture: undefined },
      { model, suffix: `${index}b`, fixture: undefined },
    ]),
    { model: null, suffix: "unpriced", fixture: undefined },
  ];
  const usageStateGenerationPlan = USAGE_STATE_FIXTURES.map((fixture) => ({
    model: null,
    suffix: fixture.suffix,
    fixture,
  }));
  const generationPlan = withUsageStates
    ? [...usageStateGenerationPlan, ...regularGenerationPlan]
    : regularGenerationPlan;

  const modelsSettingsLink = `${ctx.baseUrl}/project/${ctx.projectId}/settings/models`;
  const linksFor = (ids: string[]) => [
    traceLink(ctx, traceId, traceTimestamp),
    ...ids.map(
      (id) => `${ctx.baseUrl}/project/${ctx.projectId}/settings/models/${id}`,
    ),
    modelsSettingsLink,
  ];

  if (ctx.dryRun) {
    return {
      scenario: "custom-models",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [traceId],
      sessionIds: [],
      counts: {
        models: MODELS.length,
        pricingTiers: MODELS.reduce((sum, m) => sum + m.tiers.length, 0),
        prices: MODELS.reduce(
          (sum, m) =>
            sum + m.tiers.reduce((n, t) => n + Object.keys(t.prices).length, 0),
          0,
        ),
        traces: 1,
        observations: generationPlan.length,
        events: withV4 ? generationPlan.length + (withUsageStates ? 0 : 1) : 0,
      },
      verified: {},
      links: linksFor(MODELS.map((model) => derivedModelId(ctx, model.key))),
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  ctx.log(`writing ${MODELS.length} model definitions to postgres`);
  const writtenModelIds = new Map<string, string>();
  for (const model of MODELS) {
    writtenModelIds.set(model.key, await writeModel(ctx, model));
  }

  const trace: TraceRecordInsertType = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    session_id: null,
    timestamp: traceTimestamp,
    name: "realtime-voice-agent",
    user_id: `user-${ctx.idPrefix}`,
    tags: ["seed", "custom-models"],
    public: false,
    bookmarked: false,
    metadata: { scenario: "custom-models" },
    input: JSON.stringify({ request: "Summarise the call and embed it." }),
    output: "Summary stored.",
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const observations: ObservationRecordInsertType[] = generationPlan.map(
    ({ model, suffix, fixture }, index) => {
      const startTime =
        traceTimestamp + index * 1200 + jitter(ctx.seed, index, 200);
      const usage = model ? model.usage : UNPRICED_USAGE;
      const defaultTier = model?.tiers.find((tier) => tier.isDefault);
      const costs = defaultTier ? costFor(usage, defaultTier.prices) : null;
      const internalModelId = model
        ? (writtenModelIds.get(model.key) ?? null)
        : null;
      let parentObservationId: string | null = null;
      if (fixture?.parentSuffix) {
        parentObservationId = `${traceId}-o${fixture.parentSuffix}`;
      } else if (withUsageStates && !fixture) {
        parentObservationId = `${traceId}-o${USAGE_STATE_FIXTURES[0].suffix}`;
      }
      const durationMs =
        fixture && fixture.parentSuffix === null ? 20_000 : 900;

      return createObservation({
        id: `${traceId}-o${suffix}`,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "GENERATION",
        parent_observation_id: parentObservationId,
        name:
          fixture?.name ??
          (model ? `call-${model.key}` : "call-unpriced-vision"),
        start_time: startTime,
        end_time: startTime + durationMs,
        completion_start_time: startTime + 180,
        level: fixture?.level ?? "DEFAULT",
        status_message:
          fixture?.level === "ERROR" ? "Seeded error fixture" : null,
        input: JSON.stringify({ prompt: "Summarise the call." }),
        output: "The caller asked about pricing.",
        provided_model_name:
          fixture?.modelName ?? (model ? model.modelName : UNPRICED_MODEL_NAME),
        internal_model_id: fixture ? null : internalModelId,
        usage_pricing_tier_id:
          !fixture && internalModelId && defaultTier
            ? `tier-${internalModelId}-${defaultTier.priority}`
            : null,
        usage_pricing_tier_name: fixture ? null : (defaultTier?.name ?? null),
        provided_usage_details: fixture?.providedUsageDetails ?? usage,
        usage_details: fixture?.usageDetails ?? usage,
        provided_cost_details: fixture?.providedCostDetails ?? {},
        cost_details: fixture?.costDetails ?? costs ?? {},
        total_cost: fixture?.totalCost ?? costs?.total ?? null,
        model_parameters: JSON.stringify({ temperature: 0.2 }),
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      });
    },
  );

  const events: EventRecordInsertType[] = withV4
    ? [
        ...(withUsageStates ? [] : [traceToEvent(trace)]),
        ...observations.map((o) => observationToEvent(o, trace)),
      ]
    : [];

  ctx.log(
    `writing 1 trace, ${observations.length} generations${withV4 ? `, ${events.length} events` : ""}`,
  );
  await createTracesCh([trace]);
  for (const batch of chunk(observations, 1000)) {
    await createObservationsCh(batch);
  }
  for (const batch of chunk(events, 500)) {
    await createEventsCh(batch);
  }

  const modelIds = [...writtenModelIds.values()];
  const verified: Record<string, number> = {
    models: await prisma.model.count({ where: { id: { in: modelIds } } }),
    pricingTiers: await prisma.pricingTier.count({
      where: { modelId: { in: modelIds } },
    }),
    prices: await prisma.price.count({ where: { modelId: { in: modelIds } } }),
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND trace_id = {traceId: String}`,
      { projectId: ctx.projectId, traceId },
      "uniqExact(span_id)",
    );
  }

  const expectedPrices = MODELS.reduce(
    (sum, model) =>
      sum +
      model.tiers.reduce((n, tier) => n + Object.keys(tier.prices).length, 0),
    0,
  );
  const expectedTiers = MODELS.reduce((sum, m) => sum + m.tiers.length, 0);
  if (verified.models < MODELS.length || verified.prices < expectedPrices) {
    throw new SeedError(
      `Readback mismatch: expected ${MODELS.length} models and ${expectedPrices} prices, found ${verified.models} and ${verified.prices}`,
    );
  }
  if (verified.pricingTiers < expectedTiers) {
    throw new SeedError(
      `Readback mismatch: expected ${expectedTiers} pricing tiers, found ${verified.pricingTiers}`,
    );
  }
  if (verified.traces < 1) {
    throw new SeedError("Readback mismatch: the trace row did not land");
  }
  if (verified.observations < observations.length) {
    throw new SeedError(
      `Readback mismatch: expected ${observations.length} observations, found ${verified.observations}`,
    );
  }
  if (withV4 && verified.events < events.length) {
    throw new SeedError(
      `Readback mismatch: expected ${events.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "custom-models",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [traceId],
    sessionIds: [],
    counts: {
      models: MODELS.length,
      pricingTiers: MODELS.reduce((sum, m) => sum + m.tiers.length, 0),
      prices: expectedPrices,
      traces: 1,
      observations: observations.length,
      events: events.length,
    },
    verified,
    links: linksFor(modelIds),
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const customModelsScenario: ScenarioDefinition = {
  name: "custom-models",
  description:
    "Project-level model definitions (one tiered with a condition-gated second tier and a usage type priced at 0, one single-tier) plus a trace whose generations link to them, and one generation whose model matches no definition so its badge opens the create dialog. Reaches the price editor from a trace, the way users do.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: false,
      description:
        "also mirror the trace/generations into v4 events_full/events_core",
    },
    {
      flag: "usage-states",
      type: "boolean",
      default: false,
      description:
        "also add root and child generations covering inferred, empty, zero, and error usage/cost states",
    },
  ],
  run,
};
