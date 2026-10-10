import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  type ObservationRecordInsertType,
  type TraceRecordInsertType,
} from "../../../src/server";
import { type ObservationType } from "../../../src/domain";
import {
  AGENT_NAME_METADATA_KEY,
  SKILL_TOOL_NAMES,
} from "../../../src/features/agents/constants";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { generationUsageCost } from "./payload";
import { jitter, utcDayStartMs } from "./rng";
import {
  chunk,
  type ScenarioContext,
  type ScenarioDefinition,
  SeedError,
  type SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

const SPECIAL_AGENT = "compose / résumé? v1#";
const PARTIAL_AGENT = "native-name-only";
const SKILL_TOOL_PATTERN = `(^|[^a-z0-9_])(${SKILL_TOOL_NAMES.join("|")})($|[^a-z0-9_])`;
const skillToolPattern = new RegExp(SKILL_TOOL_PATTERN, "i");

type PlannedSpan = {
  key: string;
  parent: string | null;
  name: string;
  type: ObservationType;
  agent?: string;
  start: number;
  end: number;
  tokens?: [number, number];
  input?: unknown;
  output?: unknown;
  skill?: string;
};

const skillCalls = (
  parent: string,
  agent: string,
  start: number,
  skills: string[],
): PlannedSpan[] =>
  skills.map((skill, index) => ({
    key: `${parent}-load-skill-${index}`,
    parent,
    name: "load_skill",
    type: "TOOL",
    agent,
    start: start + index * 100,
    end: start + index * 100 + 50,
    input: { name: skill },
    output: { loaded: true, resource: `${skill}/SKILL.md` },
    skill,
  }));

const pipeline = (index: number, seed: number): PlannedSpan[] => {
  const spans: PlannedSpan[] = [
    {
      key: "root",
      parent: null,
      name: "agentique.run",
      type: "AGENT",
      agent: "agentique",
      start: 0,
      end: 60_000,
      input: { question: `Research question ${index + 1}` },
      output: { answer: "A verified answer with two citations." },
    },
  ];
  spans.push({
    key: "plan",
    parent: "root",
    name: "plan-request",
    type: "GENERATION",
    agent: "agentique",
    start: 100,
    end: 800,
    tokens: [120, 45],
  });
  spans.push(
    ...skillCalls("root", "agentique", 25, [
      "task-routing",
      "response-orchestration",
    ]),
  );
  const addStage = (agent: string, start: number, tokens: [number, number]) => {
    spans.push(
      {
        key: agent,
        parent: "root",
        name: `${agent}.run`,
        type: "AGENT",
        agent,
        start,
        end: start + 7_000,
      },
      {
        key: `${agent}-llm`,
        parent: agent,
        name: `${agent}-llm`,
        type: "GENERATION",
        agent,
        start: start + 600,
        end: start + 6_500,
        tokens,
      },
    );
  };
  addStage("intake", 1_000, [240 + jitter(seed, index * 3, 90), 60]);
  spans.push(
    ...skillCalls("intake", "intake", 1_050, [
      "requirements-extraction",
      "intent-classification",
    ]),
  );
  // A quarter of requests skip research, so agents have different trace counts.
  if (index % 4 !== 0) {
    addStage("research", 9_000, [
      2_800 + jitter(seed, index * 3 + 1, 800),
      650,
    ]);
    spans.push({
      key: "search",
      parent: "research",
      name: "web_search",
      type: "TOOL",
      agent: "research",
      start: 9_050,
      end: 9_450,
      input: { query: "source evidence" },
      output: { results: 2 },
    });
    spans.push(
      ...skillCalls("research", "research", 9_450, [
        "source-discovery",
        "evidence-ranking",
      ]),
    );
  }
  addStage("verify", 17_000, [600, 140]);
  spans.push(
    ...skillCalls("verify", "verify", 17_050, [
      "evidence-audit",
      "consistency-check",
    ]),
  );
  for (let citation = 0; citation < 2; citation++) {
    const start = 18_000 + citation * 2_000;
    spans.push(
      {
        key: `citation-${citation}`,
        parent: "verify",
        name: "verify-citation.run",
        type: "AGENT",
        agent: "verify-citation",
        start,
        end: start + 1_800,
      },
      {
        key: `citation-${citation}-llm`,
        parent: `citation-${citation}`,
        name: "check-citation",
        type: "GENERATION",
        agent: "verify-citation",
        start: start + 50,
        end: start + 1_700,
        tokens: [400, 70],
      },
      ...skillCalls(`citation-${citation}`, "verify-citation", start + 25, [
        "citation-resolution",
        "source-attribution",
      ]),
    );
  }
  addStage("compose", 25_000, [
    3_600,
    1_100 + jitter(seed, index * 3 + 2, 300),
  ]);
  spans.push({
    key: "skill",
    parent: "compose",
    name: "execute_tool load_skill",
    type: "TOOL",
    agent: "compose",
    start: 25_050,
    end: 25_150,
    input: { name: "citation-style" },
    output: { loaded: true },
    skill: "citation-style",
  });
  if (index % 3 === 0) {
    spans.push({
      key: "skill-format",
      parent: "compose",
      name: "Skill",
      type: "TOOL",
      agent: "compose",
      start: 25_200,
      end: 25_300,
      input: { skillName: "answer-format" },
      output: { loaded: true },
    });
  }
  if (index % 7 === 0) {
    spans.push(
      {
        key: "special",
        parent: "compose",
        name: "localized-compose.run",
        type: "AGENT",
        agent: SPECIAL_AGENT,
        start: 33_000,
        end: 35_000,
      },
      {
        key: "special-llm",
        parent: "special",
        name: "localized-answer",
        type: "GENERATION",
        agent: SPECIAL_AGENT,
        start: 33_050,
        end: 34_950,
        tokens: [900, 200],
      },
      ...skillCalls("special", SPECIAL_AGENT, 33_025, [
        "résumé-style",
        "locale-adaptation",
      ]),
    );
  }
  return spans;
};

const partialPipeline = (): PlannedSpan[] => [
  {
    key: "root",
    parent: null,
    name: "invoke_agent native-name-only",
    type: "AGENT",
    agent: PARTIAL_AGENT,
    start: 0,
    end: 2_000,
    input: { question: "Agent identity is not propagated to the model call." },
  },
  {
    key: "llm",
    parent: "root",
    name: "unpropagated-model-call",
    type: "GENERATION",
    start: 100,
    end: 1_900,
    tokens: [160, 50],
  },
  ...skillCalls("root", PARTIAL_AGENT, 25, [
    "integration-handshake",
    "answer-normalization",
  ]),
];

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const traceCount = params.traces as number;
  const hours = params.hours as number;
  const endHour = params["end-hour"] as number;
  const date = (params.date as string | undefined) ?? "";
  const withV4 = params.v4 as boolean;
  if (!Number.isInteger(traceCount) || traceCount < 4 || traceCount > 200) {
    throw new SeedError("--traces must be an integer between 4 and 200");
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new SeedError("--hours must be greater than 0 and at most 24");
  }
  if (!Number.isInteger(endHour) || endHour < 0 || endHour > 23) {
    throw new SeedError("--end-hour must be an integer between 0 and 23 (UTC)");
  }

  const dayStart = date ? Date.parse(`${date}T00:00:00.000Z`) : utcDayStartMs();
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(dayStart) ||
      new Date(dayStart).toISOString().slice(0, 10) !== date)
  ) {
    throw new SeedError("--date must be a valid UTC date in YYYY-MM-DD format");
  }
  const windowEnd = dayStart + endHour * 3_600_000;
  const windowStart = windowEnd - hours * 3_600_000;
  const secondaryEnvironment =
    ctx.environment === "staging" ? "production" : "staging";
  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const totalTraces = traceCount + 2;

  for (let index = 0; index < totalTraces; index++) {
    const traceId = `${ctx.idPrefix}-trace-${index}`;
    const start =
      windowStart + Math.floor((index * hours * 3_600_000) / totalTraces);
    const environment =
      index % 4 === 0 ? secondaryEnvironment : ctx.environment;
    const partial = index >= traceCount;
    const plan = partial ? partialPipeline() : pipeline(index, ctx.seed);
    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      name: partial
        ? "name-only integration"
        : `agentique question ${index + 1}`,
      timestamp: start,
      environment,
      user_id: `${ctx.idPrefix}-user-${index % 4}`,
      session_id: null,
      tags: [
        "seed",
        "agents-view",
        ...(partial ? ["partial-propagation"] : []),
      ],
      metadata: { scenario: "agents-view", seed: String(ctx.seed) },
      input: JSON.stringify({
        question: `Synthetic research question ${index + 1}`,
      }),
      output: JSON.stringify({
        answer: "A concise, verified answer with citations.",
      }),
      created_at: startedAt,
      updated_at: startedAt,
      event_ts: startedAt,
    });
    traces.push(trace);
    for (const span of plan) {
      const metadata: Record<string, string> = { scenario: "agents-view" };
      if (span.agent) metadata[AGENT_NAME_METADATA_KEY] = span.agent;
      if (span.skill) metadata["attributes.gen_ai.skill.name"] = span.skill;
      const usage = span.tokens;
      observations.push(
        createObservation({
          id: `${traceId}-${span.key}`,
          trace_id: traceId,
          project_id: ctx.projectId,
          parent_observation_id: span.parent
            ? `${traceId}-${span.parent}`
            : null,
          name: span.name,
          type: span.type,
          environment,
          start_time: start + span.start,
          end_time: start + span.end,
          completion_start_time: usage ? start + span.start + 100 : null,
          metadata,
          level: "DEFAULT",
          status_message: null,
          input: JSON.stringify(
            span.input ??
              (usage
                ? [
                    {
                      role: "user",
                      content: "Produce the next pipeline result.",
                    },
                  ]
                : {}),
          ),
          output: JSON.stringify(
            span.output ??
              (usage
                ? [{ role: "assistant", content: "Verified synthetic result." }]
                : {}),
          ),
          provided_model_name: usage ? "gpt-5.4-mini" : null,
          internal_model_id: null,
          model_parameters: "{}",
          ...(usage
            ? generationUsageCost(...usage)
            : {
                provided_usage_details: {},
                usage_details: {},
                provided_cost_details: {},
                cost_details: {},
                total_cost: null,
              }),
          prompt_id: null,
          prompt_name: null,
          prompt_version: null,
          created_at: startedAt,
          updated_at: startedAt,
          event_ts: startedAt,
        }),
      );
    }
  }
  const traceById = new Map(traces.map((trace) => [trace.id, trace]));
  const events = withV4
    ? [
        ...traces.map(traceToEvent),
        ...observations.map((observation) =>
          observationToEvent(
            observation,
            traceById.get(observation.trace_id!)!,
          ),
        ),
      ]
    : [];
  const namedObservations = observations.filter(
    (observation) => observation.metadata?.[AGENT_NAME_METADATA_KEY],
  );
  const namedSkillCalls = namedObservations.filter(
    (observation) =>
      observation.type === "TOOL" &&
      skillToolPattern.test(observation.name ?? ""),
  );
  const counts: Record<string, number> = {
    traces: traces.length,
    observations: observations.length,
    events: events.length,
    agents: new Set(
      namedObservations.map(
        (observation) => observation.metadata?.[AGENT_NAME_METADATA_KEY],
      ),
    ).size,
    namedObservations: namedObservations.length,
    runs: observations.filter((observation) => observation.type === "AGENT")
      .length,
    skillCalls: namedSkillCalls.length,
    agentsWithSkills: new Set(
      namedSkillCalls.map(
        (observation) => observation.metadata?.[AGENT_NAME_METADATA_KEY],
      ),
    ).size,
  };
  const dateRange = `${windowStart}-${windowEnd}`;
  const agentLinks = [
    "agentique",
    "intake",
    "research",
    "verify",
    "verify-citation",
    "compose",
    SPECIAL_AGENT,
    PARTIAL_AGENT,
  ].map(
    (agent) =>
      `${ctx.baseUrl}/project/${ctx.projectId}/agents/${encodeURIComponent(agent)}?dateRange=${dateRange}`,
  );
  const links = [
    `${ctx.baseUrl}/project/${ctx.projectId}/agents?dateRange=${dateRange}`,
    ...agentLinks,
    ...agentLinks.map((link) => `${link}&tab=skills`),
    traceLink(ctx, traces[0].id, windowStart),
    traceLink(
      ctx,
      traces[traceCount].id,
      windowStart + Math.floor((traceCount * hours * 3_600_000) / totalTraces),
    ),
  ];
  const summary: SeedSummary = {
    scenario: "agents-view",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traces.map((trace) => trace.id),
    sessionIds: [],
    counts,
    verified: {},
    links,
    dryRun: ctx.dryRun,
    durationMs: Date.now() - startedAt,
  };
  if (ctx.dryRun) return summary;

  ctx.log(
    `writing ${traces.length} traces, ${observations.length} observations, ${counts.agents} agents (${new Date(windowStart).toISOString()}–${new Date(windowEnd).toISOString()})`,
  );
  await createTracesCh(traces);
  for (const batch of chunk(observations, 10_000))
    await createObservationsCh(batch);
  for (const batch of chunk(events, 10_000)) await createEventsCh(batch);

  const traceIds = traces.map((trace) => trace.id);
  const queryParams = {
    projectId: ctx.projectId,
    traceIds,
    agentKey: AGENT_NAME_METADATA_KEY,
    skillToolPattern: SKILL_TOOL_PATTERN,
  };
  const where =
    "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}";
  summary.verified.traces = await countRows(
    "traces",
    "project_id = {projectId: String} AND id IN {traceIds: Array(String)}",
    queryParams,
    "uniqExact(id)",
  );
  summary.verified.observations = await countRows(
    "observations",
    where,
    queryParams,
    "uniqExact(id)",
  );
  summary.verified.runs = await countRows(
    "observations",
    `${where} AND type = 'AGENT'`,
    queryParams,
    "uniqExact(id)",
  );
  summary.verified.namedObservations = await countRows(
    "observations",
    `${where} AND metadata[{agentKey: String}] != ''`,
    queryParams,
    "uniqExact(id)",
  );
  summary.verified.agents = await countRows(
    "observations",
    `${where} AND metadata[{agentKey: String}] != ''`,
    queryParams,
    "uniqExact(metadata[{agentKey: String}])",
  );
  const skillWhere = `${where} AND type = 'TOOL' AND match(lower(name), {skillToolPattern: String})`;
  summary.verified.skillCalls = await countRows(
    "observations",
    `${skillWhere} AND metadata[{agentKey: String}] != ''`,
    queryParams,
    "uniqExact(id)",
  );
  summary.verified.agentsWithSkills = await countRows(
    "observations",
    `${skillWhere} AND metadata[{agentKey: String}] != ''`,
    queryParams,
    "uniqExact(metadata[{agentKey: String}])",
  );
  if (withV4) {
    summary.verified.events = await countRows(
      "events_full",
      where,
      queryParams,
      "uniqExact(span_id)",
    );
    summary.verified.coreAgents = await countRows(
      "events_core",
      `${where} AND has(metadata_names, {agentKey: String})`,
      queryParams,
      "uniqExact(metadata_values[indexOf(metadata_names, {agentKey: String})])",
    );
    if (summary.verified.coreAgents !== counts.agents) {
      throw new SeedError(
        `Readback mismatch: expected ${counts.agents} agents in events_core, found ${summary.verified.coreAgents}`,
      );
    }
    summary.verified.coreSkillCalls = await countRows(
      "events_core",
      `${skillWhere} AND has(metadata_names, {agentKey: String})`,
      queryParams,
      "uniqExact(span_id)",
    );
    summary.verified.coreAgentsWithSkills = await countRows(
      "events_core",
      `${skillWhere} AND has(metadata_names, {agentKey: String})`,
      queryParams,
      "uniqExact(metadata_values[indexOf(metadata_names, {agentKey: String})])",
    );
    for (const [verifiedKey, countKey] of [
      ["coreSkillCalls", "skillCalls"],
      ["coreAgentsWithSkills", "agentsWithSkills"],
    ]) {
      if (summary.verified[verifiedKey] !== counts[countKey]) {
        throw new SeedError(
          `Readback mismatch: expected ${counts[countKey]} ${countKey} in events_core, found ${summary.verified[verifiedKey]}`,
        );
      }
    }
  }
  for (const key of [
    "traces",
    "observations",
    "runs",
    "namedObservations",
    "agents",
    "skillCalls",
    "agentsWithSkills",
    ...(withV4 ? ["events"] : []),
  ]) {
    if (summary.verified[key] !== counts[key]) {
      throw new SeedError(
        `Readback mismatch: expected ${counts[key]} ${key}, found ${summary.verified[key]}`,
      );
    }
  }
  summary.durationMs = Date.now() - startedAt;
  return summary;
};

export const agentsViewScenario: ScenarioDefinition = {
  name: "agents-view",
  description:
    "Agents table/profile demo: six pipeline agents, nested citation checks, propagated exclusive costs, skills, Unicode/URL names, mixed environments, and an isolated name-only integration. Stable UTC window; v4 enabled by default.",
  supportsV4: true,
  flags: [
    {
      flag: "traces",
      type: "number",
      default: 20,
      description:
        "pipeline traces (4–200), plus two name-only integration traces",
    },
    {
      flag: "hours",
      type: "number",
      default: 4,
      description: "window width in hours (greater than 0, at most 24)",
    },
    {
      flag: "date",
      type: "string",
      default: "",
      description:
        "UTC calendar day (YYYY-MM-DD; default today); use the original date/prefix when extending an existing fixture",
    },
    {
      flag: "end-hour",
      type: "number",
      default: 12,
      description:
        "window ends at this UTC hour on --date (0–23); change timing flags with a fresh --id-prefix",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror into v4 events_full/events_core (enabled by default)",
    },
  ],
  run,
};
