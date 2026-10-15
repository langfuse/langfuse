import {
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  type EventRecordInsertType,
  type ObservationRecordInsertType,
  type TraceRecordInsertType,
} from "../../../src/server";
import { prisma } from "../../../src/db";
import {
  AGENT_NAME_METADATA_KEY,
  AGENT_PROJECTION_METADATA_KEYS as KEYS,
} from "../../../src/features/agents/constants";
import { normalizeToolsForObservation } from "../../../src/server/ingestion/extractToolsBackend";
import { extractSkillsFromObservation } from "../../../src/server/ingestion/extractSkillsBackend";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { generationUsageCost } from "./payload";
import { jitter } from "./rng";
import {
  chunk,
  SeedError,
  type ScenarioContext,
  type ScenarioDefinition,
  type SeedSummary,
} from "./types";
import { countRows, sessionLink } from "./verify";
import { seedRfcManagedSkills } from "./agents-rfc-skills";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const AGENTS = [
  {
    name: "agentique",
    task: "Route research tasks",
    area: "orchestration",
    topic: "research",
    tools: ["route_task", "delegate_task"],
    skills: ["task-routing", "response-orchestration"],
    baseline: 28,
    recent: 6,
  },
  {
    name: "intake",
    task: "Extract requirements",
    area: "planning",
    topic: "research",
    tools: ["parse_request", "classify_intent"],
    skills: ["requirements-extraction", "intent-classification"],
    baseline: 12,
    recent: 0,
  },
  {
    name: "research",
    task: "Evidence review",
    area: "evidence",
    topic: "research",
    tools: ["web_search", "read_document"],
    skills: ["source-discovery", "evidence-ranking"],
    baseline: 28,
    recent: 6,
  },
  {
    name: "verify",
    task: "Evidence review",
    area: "evidence",
    topic: "quality",
    tools: ["web_search", "check_fact"],
    skills: ["evidence-audit", "consistency-check"],
    baseline: 28,
    recent: 6,
  },
  {
    name: "verify-citation",
    task: "Resolve citations",
    area: "evidence",
    topic: "quality",
    tools: ["read_document", "resolve_citation"],
    skills: ["citation-resolution", "source-attribution"],
    baseline: 14,
    recent: 5,
  },
  {
    name: "compose",
    task: "Compose grounded answers",
    area: "writing",
    topic: "publishing",
    tools: ["format_answer", "write_draft"],
    skills: ["citation-style", "answer-format"],
    baseline: 28,
    recent: 6,
  },
  {
    name: "compose / résumé? v1#",
    task: "Adapt localized answers",
    area: "writing",
    topic: "publishing",
    tools: ["translate_text", "format_answer"],
    skills: ["résumé-style", "locale-adaptation"],
    baseline: 4,
    recent: 2,
  },
  {
    name: "native-name-only",
    task: "Run a sparse integration",
    area: "integration",
    topic: "automation",
    tools: ["run_script", "read_document"],
    skills: ["integration-handshake", "answer-normalization"],
    baseline: 3,
    recent: 1,
  },
];

type RfcSession = { id: string; start: number; environment: string };
type RfcFixture = {
  traces: TraceRecordInsertType[];
  observations: ObservationRecordInsertType[];
  events: EventRecordInsertType[];
  sessions: RfcSession[];
  windowStart: number;
  windowEnd: number;
};

type InvocationOptions = {
  parentId?: string;
  duration?: number;
  observationCount?: number;
  zeroTools?: boolean;
  costFactor?: number;
  open?: boolean;
  missingGenerationIdentity?: boolean;
  metadata?: Record<string, string>;
};

export const buildAgentsRfcFixture = (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): RfcFixture => {
  const date = String(params.date ?? "2026-10-15");
  const dayStart = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(dayStart) ||
    new Date(dayStart).toISOString().slice(0, 10) !== date
  ) {
    throw new SeedError("--date must be a valid UTC date in YYYY-MM-DD format");
  }
  const endHour = Number(params["end-hour"] ?? 15);
  const hours = Number(params.hours ?? 4);
  const days = Number(params.days ?? 15);
  if (!Number.isInteger(endHour) || endHour < 0 || endHour > 23)
    throw new SeedError("--end-hour must be an integer between 0 and 23");
  if (!Number.isInteger(hours) || hours < 1 || hours > 24)
    throw new SeedError("--hours must be an integer between 1 and 24");
  if (!Number.isInteger(days) || days < 15 || days > 30)
    throw new SeedError("--days must be an integer between 15 and 30");
  const windowEnd = dayStart + endHour * 60 * MINUTE;
  const windowStart = windowEnd - hours * 60 * MINUTE;
  const version = Date.now();
  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const nativeSkillsByObservation = new Map<
    string,
    Pick<EventRecordInsertType, "skills_available" | "skills_resource_loaded">
  >();
  const sessions = new Map<string, RfcSession>();
  const secondaryEnvironment =
    ctx.environment === "staging" ? "production" : "staging";

  const addTrace = (
    key: string,
    sessionKey: string | null,
    start: number,
    environment = ctx.environment,
  ) => {
    const sessionId = sessionKey ? `${ctx.idPrefix}-s-${sessionKey}` : null;
    if (sessionId) {
      const existing = sessions.get(sessionId);
      sessions.set(sessionId, {
        id: sessionId,
        start: Math.min(existing?.start ?? start, start),
        environment,
      });
    }
    const trace = createTrace({
      id: `${ctx.idPrefix}-t-${key}`,
      project_id: ctx.projectId,
      session_id: sessionId,
      user_id: `${ctx.idPrefix}-demo-user`,
      timestamp: start,
      environment,
      name: `RFC ${key}`,
      tags: ["seed", "agents-rfc", "synthetic"],
      metadata: { scenario: "agents-rfc", fixture: key },
      input: JSON.stringify({ task: "Produce a grounded research answer" }),
      output: JSON.stringify({ result: "Synthetic fixture response" }),
      created_at: version,
      updated_at: version,
      event_ts: version,
    });
    traces.push(trace);
    return trace;
  };

  const addInvocation = (
    trace: TraceRecordInsertType,
    key: string,
    agentIndex: number,
    start: number,
    options: InvocationOptions = {},
  ) => {
    const agent = AGENTS[agentIndex];
    const duration = options.duration ?? 30_000;
    const end = start + duration;
    const rootId = `${trace.id}-${key}`;
    const commonMetadata: Record<string, string> = {
      scenario: "agents-rfc",
      [AGENT_NAME_METADATA_KEY]: agent.name,
      [KEYS.task]: agent.task,
      [KEYS.area]: agent.area,
      [KEYS.topic]: agent.topic,
      [KEYS.availableTools]: JSON.stringify(agent.tools),
      [KEYS.availableSkills]: JSON.stringify(agent.skills),
      ...options.metadata,
    };
    const addObservation = (
      suffix: string,
      type: ObservationRecordInsertType["type"],
      name: string,
      offset: number,
      rowEnd: number | null,
      extra: Partial<Parameters<typeof createObservation>[0]> = {},
    ) => {
      const observation = createObservation({
        id: suffix ? `${rootId}-${suffix}` : rootId,
        trace_id: trace.id,
        project_id: ctx.projectId,
        parent_observation_id: suffix ? rootId : (options.parentId ?? null),
        name,
        type,
        environment: trace.environment,
        start_time: start + offset,
        end_time: rowEnd,
        completion_start_time: null,
        metadata: commonMetadata,
        input: JSON.stringify({ step: suffix || "invoke" }),
        output: JSON.stringify({ ok: true }),
        level: "DEFAULT",
        status_message: null,
        provided_model_name: null,
        internal_model_id: null,
        model_parameters: "{}",
        provided_usage_details: {},
        usage_details: {},
        provided_cost_details: {},
        cost_details: {},
        total_cost: null,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: version,
        updated_at: version,
        event_ts: version,
        ...extra,
      });
      observations.push(observation);
      if (type === "GENERATION" || name === "Skill") {
        const nativeSkills = extractSkillsFromObservation({
          skillsAvailable: agent.skills.map((skillName) => ({ skillName })),
          observationType: type,
          name,
          input: observation.input,
          output: observation.output,
          isError: false,
          projectId: ctx.projectId,
        });
        nativeSkillsByObservation.set(observation.id, {
          skills_available: nativeSkills.skillsAvailable,
          skills_resource_loaded: nativeSkills.skillsResourceLoaded,
        });
      }
    };
    addObservation(
      "",
      "AGENT",
      `${agent.name}.invoke`,
      0,
      options.open ? null : end,
    );
    const input = {
      messages: [
        {
          role: "user",
          content: `Use evidence to ${agent.task.toLowerCase()}.`,
        },
      ],
      tools: agent.tools.map((name) => ({
        type: "function",
        function: {
          name,
          description: "Synthetic demo tool",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      })),
    };
    const output = [
      {
        role: "assistant",
        content: null,
        tool_calls: agent.tools.map((name, index) => ({
          id: `${rootId}-request-${index}`,
          type: "function",
          function: {
            name,
            arguments: JSON.stringify({ query: "synthetic evidence" }),
          },
        })),
      },
    ];
    const normalized = normalizeToolsForObservation(
      input,
      output,
      commonMetadata,
    );
    const factor = options.costFactor ?? 1;
    const generationMetadata = options.missingGenerationIdentity
      ? { scenario: "agents-rfc" }
      : commonMetadata;
    addObservation(
      "model",
      "GENERATION",
      "plan next action",
      200,
      start + Math.min(duration / 2, 8_000),
      {
        input: JSON.stringify(normalized.input),
        output: JSON.stringify(normalized.output),
        metadata: generationMetadata,
        provided_model_name: "gpt-5.4-mini",
        tool_definitions: normalized.toolDefinitions,
        tool_calls: normalized.toolCalls,
        tool_call_names: normalized.toolCallNames,
        completion_start_time: start + 300,
        ...generationUsageCost(200 * factor, 50 * factor),
      },
    );
    if (!options.zeroTools) {
      for (const [index, tool] of agent.tools.entries()) {
        addObservation(
          `tool-${index}`,
          "TOOL",
          tool,
          800 + index * 250,
          start + 950 + index * 250,
          {
            input: JSON.stringify({
              query: "synthetic evidence",
              tool_call_id: `${rootId}-request-${index}`,
            }),
            output: JSON.stringify({
              result: `Synthetic ${tool} result`,
              tool_call_id: `${rootId}-request-${index}`,
            }),
          },
        );
      }
      for (const [index, skill] of agent.skills.entries()) {
        addObservation(
          `skill-${index}`,
          "TOOL",
          index === 0 ? "Skill" : "load_skill",
          1_500 + index * 100,
          start + 1_550 + index * 100,
          {
            input: JSON.stringify({ name: skill }),
            metadata: {
              ...commonMetadata,
              "attributes.gen_ai.skill.name": skill,
            },
          },
        );
      }
    }
    const fixedCount = options.zeroTools ? 2 : 6;
    const count = options.observationCount ?? 20;
    for (let index = fixedCount; index < count; index++) {
      const offset = Math.floor((index / count) * duration);
      addObservation(
        `checkpoint-${index}`,
        "SPAN",
        "evidence checkpoint",
        offset,
        start + Math.min(offset + 10, duration),
      );
    }
    return rootId;
  };

  for (const [agentIndex, agent] of AGENTS.entries()) {
    for (let index = 0; index < agent.baseline; index++) {
      const minimumAge = agentIndex === 1 ? 4 : 1;
      const ageDays =
        minimumAge +
        Math.floor(
          (index * (days - minimumAge)) / Math.max(1, agent.baseline - 1),
        );
      const start =
        windowEnd -
        ageDays * DAY +
        jitter(ctx.seed, agentIndex * 100 + index, 20 * MINUTE);
      const key = `baseline-${agentIndex}-${index}`;
      const trace = addTrace(
        key,
        key,
        start,
        index % 8 === 0 ? secondaryEnvironment : ctx.environment,
      );
      addInvocation(trace, "invoke", agentIndex, start);
    }
    for (let index = 0; index < agent.recent; index++) {
      const start =
        windowEnd - 55 * MINUTE + index * 6 * MINUTE + agentIndex * 3_000;
      const key = `recent-${agentIndex}-${index}`;
      const trace = addTrace(
        key,
        key,
        start,
        index === 0 ? secondaryEnvironment : ctx.environment,
      );
      addInvocation(trace, "invoke", agentIndex, start, {
        costFactor: agentIndex === 2 ? 32 : 1,
        duration: agentIndex === 3 ? 15 * MINUTE : 30_000,
        observationCount: agentIndex === 0 && index === 5 ? 500 : 20,
        zeroTools: agentIndex === 5 || agentIndex === 7,
      });
    }
  }

  // The same session deliberately contains repeated invocations, nested agents and multiple traces.
  const sharedStart = windowEnd - 3 * 60 * MINUTE;
  const shared = addTrace("shared-a", "shared", sharedStart);
  const parent = addInvocation(shared, "orchestrate", 0, sharedStart);
  const repeated = addInvocation(shared, "retry", 0, sharedStart + 1_000, {
    parentId: parent,
  });
  const verifier = addInvocation(shared, "verify", 3, sharedStart + 2_000, {
    parentId: repeated,
  });
  addInvocation(shared, "citation", 4, sharedStart + 3_000, {
    parentId: verifier,
  });
  const continuation = addTrace("shared-b", "shared", sharedStart + 2 * MINUTE);
  addInvocation(continuation, "resume", 0, sharedStart + 2 * MINUTE);

  const parentStart = windowEnd - 45 * MINUTE;
  const declaredParent = addTrace(
    "handoff-parent",
    "handoff-parent",
    parentStart,
  );
  addInvocation(declaredParent, "invoke", 0, parentStart);
  const declaredChild = addTrace(
    "handoff-child",
    "handoff-child",
    parentStart + MINUTE,
  );
  addInvocation(declaredChild, "invoke", 4, parentStart + MINUTE, {
    metadata: {
      [KEYS.parentSessionId]: `${ctx.idPrefix}-s-handoff-parent`,
      [KEYS.parentAgentName]: "agentique",
      handoff_provenance: "illustrative declaration",
    },
  });

  const clippedStart = windowStart - 10 * MINUTE;
  const clipped = addTrace("clipped-before", "clipped", clippedStart);
  addInvocation(clipped, "invoke", 6, clippedStart, { duration: 20 * MINUTE });
  const clippedContinuation = addTrace(
    "clipped-inside",
    "clipped",
    windowStart + MINUTE,
  );
  addInvocation(clippedContinuation, "invoke", 6, windowStart + MINUTE);

  const openStart = windowEnd - 2 * MINUTE;
  const open = addTrace("open", "open", openStart);
  addInvocation(open, "invoke", 3, openStart, { open: true });
  const sessionless = addTrace("sessionless", null, windowEnd - 20 * MINUTE);
  addInvocation(sessionless, "invoke", 7, windowEnd - 20 * MINUTE, {
    missingGenerationIdentity: true,
  });

  const tracesById = new Map(traces.map((trace) => [trace.id, trace]));
  const events =
    params.v4 === false
      ? []
      : [
          ...traces.map(traceToEvent),
          ...observations.map((observation) =>
            observationToEvent(
              observation,
              tracesById.get(observation.trace_id!)!,
              nativeSkillsByObservation.get(observation.id),
            ),
          ),
        ];
  return {
    traces,
    observations,
    events,
    sessions: [...sessions.values()],
    windowStart,
    windowEnd,
  };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const fixture = buildAgentsRfcFixture(ctx, params);
  const { traces, observations, events, sessions, windowStart, windowEnd } =
    fixture;
  const named = observations.filter(
    (row) => row.metadata?.[AGENT_NAME_METADATA_KEY],
  );
  const counts = {
    sessions: sessions.length,
    traces: traces.length,
    observations: observations.length,
    events: events.length,
    agents: new Set(named.map((row) => row.metadata?.[AGENT_NAME_METADATA_KEY]))
      .size,
    invocations: observations.filter((row) => row.type === "AGENT").length,
    tools: observations.filter((row) => row.type === "TOOL").length,
    modelToolRequests: observations.reduce(
      (total, row) => total + (row.tool_call_names?.length ?? 0),
      0,
    ),
    nativeSkillLoads: events.filter((row) => row.skills_resource_loaded?.length)
      .length,
    nativeSkillCatalogs: events.filter(
      (row) => row.type === "GENERATION" && row.skills_available?.length,
    ).length,
    managedSkills: params["managed-skills"] === true ? 4 : 0,
  };
  const range = `dateRange=${windowStart}-${windowEnd}`;
  const base = `${ctx.baseUrl}/project/${ctx.projectId}/agents`;
  const links = [
    `${base}?${range}`,
    ...AGENTS.map(
      (agent) => `${base}/${encodeURIComponent(agent.name)}?${range}`,
    ),
    `${base}/agentique?${range}&tab=sessions`,
    `${base}/research?${range}&tab=tools`,
    `${base}/compose?${range}&tab=skills`,
    `${base}/agentique?${range}&tab=map`,
    sessionLink(ctx, `${ctx.idPrefix}-s-shared`),
    sessionLink(ctx, `${ctx.idPrefix}-s-handoff-child`),
  ];
  const summary: SeedSummary = {
    scenario: "agents-rfc",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traces.map((row) => row.id),
    sessionIds: sessions.map((row) => row.id),
    counts,
    verified: {},
    links,
    dryRun: ctx.dryRun,
    durationMs: Date.now() - startedAt,
  };
  if (ctx.dryRun) return summary;
  if (params["managed-skills"] === true)
    summary.verified.managedSkills = await seedRfcManagedSkills(ctx);
  for (const session of sessions) {
    await prisma.traceSession.upsert({
      where: { id_projectId: { id: session.id, projectId: ctx.projectId } },
      update: {},
      create: {
        id: session.id,
        projectId: ctx.projectId,
        environment: session.environment,
        createdAt: new Date(session.start),
      },
    });
  }
  ctx.log(
    `writing ${sessions.length} sessions, ${traces.length} traces, ${observations.length} observations; window ${new Date(windowStart).toISOString()}–${new Date(windowEnd).toISOString()}`,
  );
  for (const batch of chunk(traces, 1_000)) await createTracesCh(batch);
  for (const batch of chunk(observations, 10_000))
    await createObservationsCh(batch);
  for (const batch of chunk(events, 10_000)) await createEventsCh(batch);
  const queryParams = {
    projectId: ctx.projectId,
    traceIds: summary.traceIds,
    agentKey: AGENT_NAME_METADATA_KEY,
  };
  const where =
    "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}";
  summary.verified.sessions = await prisma.traceSession.count({
    where: { projectId: ctx.projectId, id: { in: summary.sessionIds } },
  });
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
  summary.verified.invocations = await countRows(
    "observations",
    `${where} AND type = 'AGENT'`,
    queryParams,
    "uniqExact(id)",
  );
  summary.verified.tools = await countRows(
    "observations",
    `${where} AND type = 'TOOL'`,
    queryParams,
    "uniqExact(id)",
  );
  summary.verified.agents = await countRows(
    "observations",
    `${where} AND metadata[{agentKey: String}] != ''`,
    queryParams,
    "uniqExact(metadata[{agentKey: String}])",
  );
  summary.verified.modelToolRequests = await countRows(
    events.length ? "events_full" : "observations",
    where,
    queryParams,
    "uniqExactArray(tool_calls)",
  );
  if (events.length) {
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
    if (summary.verified.coreAgents !== counts.agents)
      throw new SeedError(
        "Readback mismatch: RFC agent identities did not reach events_core",
      );
    for (const table of ["events_full", "events_core"]) {
      const loads = await countRows(
        table,
        `${where} AND notEmpty(skills_resource_loaded)`,
        queryParams,
        "uniqExact(span_id)",
      );
      const catalogs = await countRows(
        table,
        `${where} AND type = 'GENERATION' AND notEmpty(skills_available)`,
        queryParams,
        "uniqExact(span_id)",
      );
      if (
        loads !== counts.nativeSkillLoads ||
        catalogs !== counts.nativeSkillCatalogs
      )
        throw new SeedError(
          `Readback mismatch: native skill evidence did not reach ${table}`,
        );
      summary.verified[`${table}NativeSkillLoads`] = loads;
      summary.verified[`${table}NativeSkillCatalogs`] = catalogs;
    }
  }
  for (const key of [
    "sessions",
    "traces",
    "observations",
    "invocations",
    "tools",
    "agents",
    "modelToolRequests",
    ...(events.length ? ["events"] : []),
    ...(params["managed-skills"] === true ? ["managedSkills"] : []),
  ]) {
    if (summary.verified[key] !== counts[key as keyof typeof counts])
      throw new SeedError(
        `Readback mismatch: expected ${counts[key as keyof typeof counts]} ${key}, found ${summary.verified[key]}`,
      );
  }
  summary.durationMs = Date.now() - startedAt;
  return summary;
};

export const agentsRfcScenario: ScenarioDefinition = {
  name: "agents-rfc",
  description:
    "Agent RFC: true shared/multi-trace sessions, 15-day history, recent cost/runtime/tool/volume changes, dormant/sparse/open examples, declared capabilities and illustrative handoffs.",
  supportsV4: true,
  flags: [
    {
      flag: "date",
      type: "string",
      default: "2026-10-15",
      description:
        "fixed UTC demo day (YYYY-MM-DD); use a new prefix when changing time",
    },
    {
      flag: "end-hour",
      type: "number",
      default: 15,
      description: "fixed UTC demo end hour (0–23)",
    },
    {
      flag: "hours",
      type: "number",
      default: 4,
      description:
        "selected UI window in hours (1–24); baseline history is independent",
    },
    {
      flag: "days",
      type: "number",
      default: 15,
      description: "historical discovery coverage in days (15–30)",
    },
    {
      flag: "managed-skills",
      type: "boolean",
      default: false,
      description:
        "create four missing managed skill definitions through the local Skills API (default seed project only)",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "mirror v3 observations into v4 events (on by default)",
    },
  ],
  run,
};
