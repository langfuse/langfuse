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
  const traceId = `${ctx.idPrefix}-t0`;
  // Anchored on today's UTC midnight, never the wall clock: these land in
  // ClickHouse ORDER BY keys and a re-run must overwrite in place.
  const traceTimestamp = utcDayStartMs() - 30 * 60 * 1000;

  const generationPlan = [
    ...MODELS.flatMap((model, index) => [
      { model, suffix: `${index}a` },
      { model, suffix: `${index}b` },
    ]),
    { model: null, suffix: "unpriced" },
  ];

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
        events: withV4 ? generationPlan.length + 1 : 0,
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
    ({ model, suffix }, index) => {
      const startTime =
        traceTimestamp + index * 1200 + jitter(ctx.seed, index, 200);
      const usage = model ? model.usage : UNPRICED_USAGE;
      const defaultTier = model?.tiers.find((tier) => tier.isDefault);
      const costs = defaultTier ? costFor(usage, defaultTier.prices) : null;
      const internalModelId = model
        ? (writtenModelIds.get(model.key) ?? null)
        : null;

      return createObservation({
        id: `${traceId}-o${suffix}`,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "GENERATION",
        parent_observation_id: null,
        name: model ? `call-${model.key}` : "call-unpriced-vision",
        start_time: startTime,
        end_time: startTime + 900,
        completion_start_time: startTime + 180,
        level: "DEFAULT",
        status_message: null,
        input: JSON.stringify({ prompt: "Summarise the call." }),
        output: "The caller asked about pricing.",
        provided_model_name: model ? model.modelName : UNPRICED_MODEL_NAME,
        internal_model_id: internalModelId,
        usage_pricing_tier_id:
          internalModelId && defaultTier
            ? `tier-${internalModelId}-${defaultTier.priority}`
            : null,
        usage_pricing_tier_name: defaultTier?.name ?? null,
        provided_usage_details: usage,
        usage_details: usage,
        provided_cost_details: {},
        cost_details: costs ?? {},
        total_cost: costs?.total ?? null,
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
        traceToEvent(trace),
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
  ],
  run,
};
