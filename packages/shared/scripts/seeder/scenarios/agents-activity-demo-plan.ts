import { createHash } from "node:crypto";
import type {
  EventRecordInsertType,
  ScoreRecordInsertType,
} from "../../../src/server/repositories/definitions";
import {
  createEvent,
  createSessionScore,
  createTraceScore,
} from "../../../src/server/test-utils/tracing-factory";
import {
  convertCallsToArrays,
  convertDefinitionsToMap,
} from "../../../src/server/ingestion/extractToolsBackend";
import { jitter, Rng, utcDayStartMs } from "./rng";
import { SeedError, type ScenarioContext } from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ROLES = [
  "orchestrator",
  "researcher",
  "reviewer",
  "writer",
  "router",
] as const;
type Role = (typeof ROLES)[number];
export type ActivityDemoStory = "agentique" | "halo" | "coding";
export function activityDemoSkillInstructions(
  story: ActivityDemoStory,
  version: number,
) {
  const instructions = {
    agentique: [
      "Cite primary documents for factual claims.",
      "Cite primary documents, verify dates, and label unsupported claims.",
    ],
    halo: [
      "Check plan limits and link product documentation.",
      "Check plan limits, distinguish admin rights, and never claim a plan change was executed.",
    ],
    coding: [
      "Inspect source before proposing a patch.",
      "Inspect source, bound retries and timeouts, and label test results as authored unless executed.",
    ],
  };
  return instructions[story][version === 1 ? 0 : 1]!;
}
type Behavior =
  | "baseline"
  | "tool-dropout"
  | "retry-loop"
  | "model-regression"
  | "recovery";
const ANSWERS: Record<Role, string> = {
  writer:
    "Deploy after the documented approval, verify health checks, and keep the previous release available for rollback. The sources do not establish a fixed deployment duration. [Deployment guide](https://example.com/docs/deployment) [Release checklist](https://example.com/docs/release-checklist)",
  reviewer:
    "Approval and rollback claims are supported. The timing claim is unsupported and must be omitted.",
  orchestrator:
    "I will research the request, verify the sources, and ask the writer for a cited answer.",
  researcher:
    "The deployment guide and release checklist support approval, health checks, and rollback. Deployment timing is not specified.",
  router: "Route this request to the product search workflow.",
};
const STORIES = {
  agentique: {
    skill: "research-evidence",
    service: "synthetic-research-assistant",
    tools: ["search_documents", "read_document"],
    model: "gpt-4.1-mini",
    regressedModel: "gpt-4.1-nano",
    recoveryModel: "gpt-4.1",
    costScale: 1,
    names: {
      orchestrator: "Orchestrator",
      researcher: "Researcher",
      reviewer: "Reviewer",
      writer: "Writer",
      router: "Router",
    },
    questions: [
      "Which documents explain deploying a feature safely?",
      "Double-check rollback and flag unsupported timing claims.",
      "Write the final release note with references.",
    ],
    finding: ANSWERS.researcher,
    answer: ANSWERS.writer,
  },
  halo: {
    skill: "product-answering",
    service: "synthetic-product-assistant",
    tools: ["search_product_docs", "read_plan_limits"],
    model: "gpt-4.1-mini",
    regressedModel: "gpt-4.1-nano",
    recoveryModel: "gpt-4.1",
    costScale: 0.7,
    names: {
      orchestrator: "Halo assistant",
      researcher: "Product search",
      reviewer: "Answer reviewer",
      writer: "Answer writer",
      router: "Legacy answer router",
    },
    questions: [
      "Does our team plan include audit history and how can we change it?",
      "Check which settings require an organization admin.",
      "Write a short answer with links to the relevant product documentation.",
    ],
    finding:
      "The synthetic plan guide lists audit history by plan, and organization settings require admin access. No plan change has been performed.",
    answer:
      "Check the plan's audit-history limits, then ask an organization admin to review the change in settings. [Plan guide](https://example.com/docs/plans) [Organization settings](https://example.com/docs/organization-settings)",
  },
  coding: {
    skill: "safe-code-changes",
    service: "synthetic-coding-assistant",
    tools: ["search_repository", "read_source_file"],
    model: "claude-sonnet-4-5",
    regressedModel: "claude-haiku-4-5",
    recoveryModel: "claude-sonnet-4-5",
    costScale: 3,
    names: {
      orchestrator: "Coding planner",
      researcher: "Code search",
      reviewer: "Code reviewer",
      writer: "Coding assistant",
      router: "Router",
    },
    questions: [
      "Add bounded retries to the synthetic document fetcher without retrying client errors.",
      "Review the timeout and backoff behavior and identify the smallest regression test.",
      "Prepare the patch summary and test plan.",
    ],
    finding:
      "The synthetic fetcher retries network failures and 5xx responses only. Backoff is bounded; 4xx responses return immediately. These are authored test results, not executed repository tests.",
    answer:
      "Proposed patch: retry network failures and 5xx responses up to three attempts, preserve the total timeout, and return 4xx errors immediately. Add focused tests for a 503 followed by success and for a 400 with no retry. This is a synthetic patch proposal; no repository was changed.",
  },
} satisfies Record<
  ActivityDemoStory,
  {
    skill: string;
    service: string;
    tools: string[];
    model: string;
    regressedModel: string;
    recoveryModel: string;
    costScale: number;
    names: Record<Role, string>;
    questions: string[];
    finding: string;
    answer: string;
  }
>;
export const ACTIVITY_DEMO_PENDING_SKILL =
  "agents-activity-demo-pending-catalog";
const activityDemoSkillName = (prefix: string, story: ActivityDemoStory) =>
  `${STORIES[story].skill}-${createHash("sha256").update(prefix).digest("hex").slice(0, 12)}`;

type ActivityDemoPlan = {
  events: EventRecordInsertType[];
  scores: ScoreRecordInsertType[];
  from: number;
  to: number;
  displayFrom: number;
  comparisonFrom: number;
  heroSessionId: string;
  heroTraceIds: string[];
  skillName: string;
  skills: { story: ActivityDemoStory; name: string }[];
};

const integer = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  name: string,
) => {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new SeedError(`${name} must be between ${min} and ${max}`);
  return number;
};
const iso = (at: number) =>
  new Date(at).toISOString().replace("T", " ").replace("Z", "");

/** Revisions advance independently of deterministic event and score storage keys. */
export function activityDemoWriteRows<
  T extends { event_ts: string; updated_at: string },
>(rows: T[], at: number): T[] {
  const version = iso(at);
  return rows.map((row) => ({
    ...row,
    event_ts: version,
    updated_at: version,
  }));
}

/** A static, synthetic history. Storage keys depend on the explicit date, seed and row index. */
export function buildAgentsActivityDemoPlan(
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): ActivityDemoPlan {
  const days = integer(params.days, 14, 1, 30, "days");
  const conversations = integer(
    params.conversations,
    120,
    1,
    1000,
    "conversations",
  );
  const backgroundJobs = integer(
    params["background-jobs"],
    12,
    0,
    500,
    "background-jobs",
  );
  const stories = String(params.stories ?? "agentique,halo,coding")
    .split(",")
    .map((story) => story.trim());
  if (
    !stories.length ||
    stories.some((story) => !Object.hasOwn(STORIES, story)) ||
    new Set(stories).size !== stories.length
  )
    throw new SeedError(
      "stories must contain distinct comma-separated choices: agentique,halo,coding",
    );
  const selectedStories = stories as ActivityDemoStory[];
  const date = String(
    params.date || new Date(utcDayStartMs() - DAY).toISOString().slice(0, 10),
  );
  const finalDay = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(finalDay) ||
    new Date(finalDay).toISOString().slice(0, 10) !== date ||
    finalDay >= utcDayStartMs()
  )
    throw new SeedError(
      "date must be a completed UTC day in YYYY-MM-DD format",
    );
  const candidateEnvironment = String(
    params["candidate-environment"] ?? "staging",
  );
  if (
    !candidateEnvironment.trim() ||
    candidateEnvironment === ctx.environment ||
    candidateEnvironment.length > 256
  )
    throw new SeedError(
      "candidate-environment must be nonempty, distinct from --environment, and at most 256 characters",
    );
  if (
    !ctx.idPrefix ||
    [...`${ctx.idPrefix}:agent:agentique:orchestrator`].length > 256
  )
    throw new SeedError(
      "id-prefix must be nonempty and leave room for a namespaced agent identity (at most 227 characters)",
    );
  const to = finalDay + DAY;
  const from = to - days * DAY;
  const displayFrom = to - Math.max(1, Math.floor(days / 2)) * DAY;
  const comparisonFrom = displayFrom - (to - displayFrom);
  const events: EventRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const skillName = activityDemoSkillName(ctx.idPrefix, "agentique");
  const skills = [
    ...new Set<ActivityDemoStory>(["agentique", ...selectedStories]),
  ].map((story) => ({
    story,
    name: activityDemoSkillName(ctx.idPrefix, story),
  }));
  const heroSessionId = `${ctx.idPrefix}-conversation-0`;
  const heroTraceIds: string[] = [];

  const addScore = (
    traceId: string,
    at: number,
    environment: string,
    success: boolean,
    observationId?: string,
    quality?: number,
  ) => {
    const citationCoverage = success ? 0.96 : 0.24;
    const successLabel = success ? "True" : "False";
    let name = observationId ? "citation_coverage" : "task_success";
    if (quality !== undefined) name = "answer_quality";
    scores.push(
      createTraceScore({
        id: `${observationId ?? traceId}-score-${quality === undefined ? "outcome" : "quality"}`,
        project_id: ctx.projectId,
        trace_id: traceId,
        observation_id: observationId ?? null,
        environment,
        timestamp: at,
        created_at: at,
        updated_at: at,
        event_ts: at,
        name,
        value: quality ?? (observationId ? citationCoverage : Number(success)),
        string_value: observationId ? null : successLabel,
        data_type: observationId ? "NUMERIC" : "BOOLEAN",
        source: "API",
        comment:
          "Authored synthetic demo outcome; no evaluator or model was executed.",
        metadata: { synthetic: "true", scenario: "agents-activity-demo" },
        ingestion_api_key: "",
        ingestion_sdk_name: "seed-cli",
        ingestion_sdk_version: "1",
      }),
    );
  };

  const addTrace = (opts: {
    traceId: string;
    sessionId: string;
    environment: string;
    at: number;
    behavior: Behavior;
    researchCount: number;
    review: boolean;
    question: string;
    index: number;
    story: ActivityDemoStory;
    background?: boolean;
  }) => {
    const story = STORIES[opts.story];
    const skillName = activityDemoSkillName(ctx.idPrefix, opts.story);
    const identityPrefix =
      opts.story === "agentique"
        ? `${ctx.idPrefix}:agent`
        : `${ctx.idPrefix}:agent:${opts.story}`;
    const createdRuns: EventRecordInsertType[] = [];
    const rng = new Rng(ctx.seed + opts.index * 7919);
    const rootId = `${opts.traceId}-request`;
    const orchestratorId = `${opts.traceId}-orchestrator`;
    const version = opts.behavior === "recovery" ? 2 : 1;
    const metadata = {
      "demo.behavior": opts.behavior,
      "demo.scenario": "agents-activity-demo",
      "demo.synthetic": "true",
      "demo.story": opts.story,
      "demo.workload": opts.background ? "background" : "conversation",
    };
    const common = {
      project_id: ctx.projectId,
      trace_id: opts.traceId,
      trace_name: opts.background ? "Scheduled evidence digest" : opts.question,
      session_id: opts.sessionId,
      user_id: opts.background
        ? ""
        : `demo-user-${Math.floor(opts.index / 10) % 9}`,
      environment: opts.environment,
      tags: ["synthetic", "agents-activity-demo", opts.behavior],
      created_at: opts.at,
      updated_at: opts.at,
      event_ts: opts.at,
      metadata_names: Object.keys(metadata),
      metadata_values: Object.values(metadata),
      usage_details: {},
      provided_usage_details: {},
      cost_details: {},
      provided_cost_details: {},
      provided_model_name: null,
      agent_id: "",
      agent_name: "",
      agent_run_id: "",
      agent_identity_source: "",
      ingestion_api_key: "",
      ingestion_sdk_name: "seed-cli",
      ingestion_sdk_version: "1",
      source: "API",
      service_name: story.service,
      completion_start_time: null,
    };
    const append = (id: string, fields: Parameters<typeof createEvent>[0]) => {
      const event = createEvent({ ...common, id, span_id: id, ...fields });
      events.push(event);
      return event;
    };
    const invoke = (
      role: Role,
      ordinal: number,
      at: number,
      parent: string,
    ) => {
      const id =
        role === "orchestrator"
          ? orchestratorId
          : `${opts.traceId}-${role}-${ordinal}`;
      const identity = {
        agent_id: `${identityPrefix}:${role}`,
        agent_name: story.names[role],
        agent_run_id: id,
        agent_identity_source: "gen-ai",
      };
      const expensive = role === "researcher" && opts.behavior === "retry-loop";
      const dropout = role === "researcher" && opts.behavior === "tool-dropout";
      let baseDuration = {
        researcher: 4500,
        reviewer: 2600,
        writer: 1400,
        orchestrator: 1400,
        router: 900,
      }[role];
      if (dropout) baseDuration = 1800;
      if (expensive) baseDuration = 18_000;
      const duration =
        baseDuration +
        jitter(
          ctx.seed,
          opts.index * 100 + ordinal + ROLES.indexOf(role) * 10,
          700,
        );
      let tools: string[] = [];
      if (role === "researcher" && !dropout)
        tools = ["loadSkill", ...story.tools];
      if (role === "reviewer")
        tools = [
          opts.story === "coding" ? "inspect_test_plan" : "check_citations",
        ];
      let answer = dropout
        ? "I could not verify this answer against the source documents. Treat the deployment timing as unconfirmed."
        : ANSWERS[role];
      if (!dropout && role === "researcher") answer = story.finding;
      if (role === "writer") answer = story.answer;
      if (opts.behavior === "tool-dropout" && role === "reviewer")
        answer =
          "The research step returned no source evidence. I cannot approve the deployment claims or their citations.";
      if (opts.behavior === "tool-dropout" && role === "writer")
        answer =
          "This draft is unverified because the research tools were not called. Request another research pass before publishing a deployment recommendation.";
      if (opts.behavior === "model-regression" && role === "writer") {
        answer = {
          agentique:
            "Deployments always finish within two minutes, and rollback is automatic.",
          halo: "Everyone on the team can change the plan, and audit history is unlimited.",
          coding:
            "Retry every response until it succeeds, including client errors.",
        }[opts.story];
      }
      if (opts.behavior === "model-regression" && role === "reviewer")
        answer =
          "The candidate draft contains unsupported claims. It needs revision before use.";
      const run = append(id, {
        ...identity,
        parent_span_id: parent,
        type: "AGENT",
        name: story.names[role],
        start_time: at,
        end_time: at + duration,
        input: JSON.stringify([{ role: "user", content: opts.question }]),
        output: JSON.stringify([{ role: "assistant", content: answer }]),
        ...(role === "researcher"
          ? {
              skills_available: [
                {
                  skillName,
                  skillVersion: version,
                  langfuseSkillId: ACTIVITY_DEMO_PENDING_SKILL,
                },
              ],
            }
          : {}),
      });
      createdRuns.push(run);
      let modelCount = tools.length > 0 ? 2 : 1;
      if (expensive) modelCount = 4;
      for (let modelIndex = 0; modelIndex < modelCount; modelIndex++) {
        const input = rng.int(600, 2400) * (expensive ? 4 : 1) + ordinal * 90;
        const output = rng.int(
          role === "writer" ? 180 : 50,
          role === "writer" ? 650 : 240,
        );
        const usage: Record<string, number> = {
          input,
          output,
          total: input + output,
        };
        const cacheIndex =
          opts.index * 100 +
          ROLES.indexOf(role) * 10_000 +
          ordinal * 9 +
          modelIndex;
        // Missing provider cache reporting stays distinct from a reported cold-cache miss.
        if (jitter(ctx.seed, cacheIndex, 7) !== 0) {
          let hitRate = { agentique: 0.72, halo: 0.82, coding: 0.88 }[
            opts.story
          ];
          if (opts.behavior === "model-regression") hitRate = 0.08;
          if (opts.behavior === "tool-dropout") hitRate = 0.25;
          if (opts.behavior === "retry-loop") hitRate = 0.35;
          if (opts.behavior === "recovery") hitRate = 0.92;
          hitRate = Math.min(
            0.96,
            Math.max(
              0,
              hitRate + (jitter(ctx.seed, cacheIndex + 50_000, 8) - 4) / 100,
            ),
          );
          if (role === "orchestrator" || role === "router") hitRate = 0;
          const cachedInput = Math.floor(input * hitRate);
          usage.input = input - cachedInput;
          usage.input_cached_tokens = cachedInput;
        }
        // Authored costs make the fixture independent of provider pricing and model calls.
        const cost = Number(
          (
            ((input * (version === 2 ? 2 : 0.4) +
              output * (version === 2 ? 8 : 1.6)) *
              story.costScale) /
            1_000_000
          ).toFixed(8),
        );
        const modelAt =
          at +
          (modelIndex === 0
            ? 20
            : Math.floor(
                duration * (0.65 + ((modelIndex - 1) * 0.3) / (modelCount - 1)),
              ));
        const toolCalls = tools.map((name, toolIndex) => ({
          id: `${id}-call-${toolIndex}`,
          type: "function",
          function: {
            name,
            arguments: JSON.stringify(
              name === "loadSkill"
                ? { name: skillName, version }
                : { query: opts.question },
            ),
          },
        }));
        const calls = modelIndex === 0 ? toolCalls : [];
        const toolColumns = convertCallsToArrays(
          calls.map((call, index) => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
            type: call.type,
            index,
          })),
        );
        let model = story.model;
        if (opts.behavior === "model-regression") model = story.regressedModel;
        if (opts.behavior === "recovery") model = story.recoveryModel;
        append(`${id}-model-${modelIndex}`, {
          ...identity,
          parent_span_id: id,
          type: "GENERATION",
          name:
            modelIndex === 0
              ? "Plan and request evidence"
              : "Synthesize evidence",
          start_time: modelAt,
          end_time:
            modelIndex === 0
              ? at + Math.floor(duration * 0.35)
              : modelAt + Math.floor((duration * 0.09) / (modelCount - 1)),
          completion_start_time: modelAt + 50,
          provided_model_name: model,
          model_parameters: JSON.stringify({ temperature: 0.2 }),
          usage_details: usage,
          provided_usage_details: { ...usage },
          cost_details: { total: cost },
          provided_cost_details: { total: cost },
          ...toolColumns,
          tool_definitions: convertDefinitionsToMap(
            tools.map((name) => ({
              name,
              description: "Synthetic research fixture tool",
              parameters: JSON.stringify({ type: "object" }),
            })),
          ),
          input: JSON.stringify([
            { role: "user", content: opts.question },
            ...(modelIndex > 0
              ? [
                  { role: "assistant", content: null, tool_calls: toolCalls },
                  ...toolCalls.map((call) => ({
                    role: "tool",
                    tool_call_id: call.id,
                    content:
                      opts.behavior === "tool-dropout"
                        ? "No research evidence was supplied. The draft cannot be approved."
                        : story.finding,
                  })),
                ]
              : []),
          ]),
          output: JSON.stringify([
            {
              role: "assistant",
              content: calls.length > 0 ? null : answer,
              ...(calls.length > 0 ? { tool_calls: calls } : {}),
            },
          ]),
        });
      }
      tools.forEach((name, toolIndex) =>
        append(`${id}-tool-${toolIndex}`, {
          ...identity,
          parent_span_id: id,
          type: "TOOL",
          name,
          metadata_names: [...common.metadata_names, "toolCallId"],
          metadata_values: [
            ...common.metadata_values,
            `${id}-call-${toolIndex}`,
          ],
          start_time: at + Math.floor(duration * 0.43) + toolIndex * 100,
          end_time: at + Math.floor(duration * 0.58) + toolIndex * 100,
          input: JSON.stringify(
            name === "loadSkill"
              ? { name: skillName, version, path: "SKILL.md" }
              : { query: opts.question },
          ),
          output: JSON.stringify(
            name === "loadSkill"
              ? {
                  name: skillName,
                  version,
                  path: "SKILL.md",
                  content: activityDemoSkillInstructions(opts.story, version),
                }
              : {
                  sources:
                    opts.behavior === "tool-dropout"
                      ? []
                      : [
                          "https://example.com/docs/deployment",
                          "https://example.com/docs/release-checklist",
                        ],
                  supported: opts.behavior !== "tool-dropout",
                },
          ),
          ...(name === "loadSkill"
            ? {
                skills_resource_loaded: [
                  {
                    skillName,
                    skillVersion: version,
                    langfuseSkillId: ACTIVITY_DEMO_PENDING_SKILL,
                    filePath: "SKILL.md",
                  },
                ],
              }
            : {}),
        }),
      );
      if (role === "researcher")
        addScore(opts.traceId, at + duration, opts.environment, !dropout, id);
      return { run, end: at + duration };
    };

    const orchestrator = invoke("orchestrator", 0, opts.at + 20, rootId);
    let cursor = orchestrator.end + 100;
    if (
      opts.story === "halo" &&
      opts.behavior === "baseline" &&
      !opts.background
    )
      cursor = invoke("router", 0, cursor, orchestratorId).end + 100;
    for (let research = 0; research < opts.researchCount; research++)
      cursor = invoke("researcher", research, cursor, orchestratorId).end + 100;
    if (opts.review)
      cursor = invoke("reviewer", 0, cursor, orchestratorId).end + 100;
    cursor = invoke("writer", 0, cursor, orchestratorId).end + 100;
    orchestrator.run.end_time = iso(cursor);
    orchestrator.run.output = JSON.stringify([
      {
        role: "assistant",
        content:
          opts.behavior === "tool-dropout" ||
          opts.behavior === "model-regression"
            ? "The answer lacks source verification. Request another research pass before publishing."
            : "The cited answer is ready for review; unsupported timing claims were omitted.",
      },
    ]);
    append(rootId, {
      parent_span_id: "",
      type: "SPAN",
      name: opts.background ? "Scheduled research digest" : "Assistant request",
      is_app_root: true,
      start_time: opts.at,
      end_time: cursor + 20,
      input: JSON.stringify([{ role: "user", content: opts.question }]),
      output: orchestrator.run.output,
    });
    addScore(
      opts.traceId,
      cursor,
      opts.environment,
      opts.behavior !== "tool-dropout" && opts.behavior !== "model-regression",
    );
    let quality = 0.92;
    if (opts.behavior === "tool-dropout") quality = 0.28;
    if (opts.behavior === "model-regression") quality = 0.48;
    if (opts.behavior === "recovery") quality = 0.97;
    for (const [runIndex, run] of createdRuns.entries()) {
      const observedQuality = Math.min(
        0.99,
        quality +
          new Rng(ctx.seed + opts.index * 103 + runIndex).int(-3, 2) / 100,
      );
      addScore(
        opts.traceId,
        Date.parse(`${run.end_time!.replace(" ", "T")}Z`),
        opts.environment,
        observedQuality >= 0.8,
        run.span_id,
        observedQuality,
      );
    }
    return cursor;
  };

  for (let conversation = 0; conversation < conversations; conversation++) {
    const story =
      conversation === 0
        ? "agentique"
        : selectedStories[conversation % selectedStories.length]!;
    // Fixed examples remain present in the small fixture; remaining traffic is weighted and irregular.
    const fixed: Behavior[] = [
      "recovery",
      "baseline",
      "tool-dropout",
      "retry-loop",
      "recovery",
      "model-regression",
    ];
    const weightedDay = jitter(ctx.seed, conversation * 31, days * days - 1);
    const fixedDays = [
      days - 1,
      0,
      Math.floor((days - 1) / 2),
      Math.floor((days - 1) / 2),
      days - 1,
      Math.floor((days - 1) / 2),
    ];
    const day = fixedDays[conversation] ?? Math.floor(Math.sqrt(weightedDay));
    let behavior: Behavior = fixed[conversation] ?? "tool-dropout";
    if (fixed[conversation] === undefined) {
      if (day < days / 2) behavior = "baseline";
      else if (day >= days - 2) behavior = "recovery";
      else if (conversation % 5 === 0) behavior = "model-regression";
      else if (conversation % 3 === 0) behavior = "retry-loop";
    }
    const environment =
      conversation > 0 && conversation % 4 === 0
        ? candidateEnvironment
        : ctx.environment;
    const at =
      from +
      day * DAY +
      (conversation === 0
        ? 14
        : 8 + jitter(ctx.seed, conversation * 31 + 1, 10)) *
        HOUR +
      jitter(ctx.seed, conversation * 31 + 2, 45 * 60_000);
    const turns =
      conversation === 0 ? 3 : 2 + jitter(ctx.seed, conversation * 31 + 3, 1);
    let end = at;
    for (let turn = 0; turn < turns; turn++) {
      const traceId = `${ctx.idPrefix}-conversation-${conversation}-request-${turn}`;
      if (conversation === 0) heroTraceIds.push(traceId);
      let researchCount = 1 + jitter(ctx.seed, conversation * 31 + turn + 4, 1);
      if (behavior === "retry-loop") researchCount = 3;
      if (conversation === 0) researchCount = [2, 3, 1][turn]!;
      end = addTrace({
        traceId,
        sessionId: `${ctx.idPrefix}-conversation-${conversation}`,
        environment,
        at: at + turn * 7 * 60_000,
        behavior,
        question: STORIES[story].questions[turn]!,
        story,
        index: conversation * 10 + turn,
        researchCount,
        review: conversation !== 0 || turn < 2,
      });
    }
    scores.push(
      createSessionScore({
        id: `${ctx.idPrefix}-conversation-${conversation}-score-task-success`,
        project_id: ctx.projectId,
        session_id: `${ctx.idPrefix}-conversation-${conversation}`,
        environment,
        timestamp: end,
        created_at: end,
        updated_at: end,
        event_ts: end,
        name: "task_success",
        data_type: "BOOLEAN",
        value: Number(
          behavior !== "tool-dropout" && behavior !== "model-regression",
        ),
        string_value:
          behavior !== "tool-dropout" && behavior !== "model-regression"
            ? "True"
            : "False",
        source: "API",
        comment:
          "Authored synthetic conversation outcome; not a live evaluation.",
        metadata: { synthetic: "true", scenario: "agents-activity-demo" },
        ingestion_api_key: "",
        ingestion_sdk_name: "seed-cli",
        ingestion_sdk_version: "1",
      }),
    );
  }
  for (let job = 0; job < backgroundJobs; job++) {
    const index = 100_000 + job;
    const story = selectedStories[job % selectedStories.length]!;
    addTrace({
      traceId: `${ctx.idPrefix}-background-${job}`,
      sessionId: "",
      environment: job % 4 === 3 ? candidateEnvironment : ctx.environment,
      at:
        from +
        jitter(ctx.seed, index, days - 1) * DAY +
        (3 + jitter(ctx.seed, index + 1000, 2)) * HOUR +
        jitter(ctx.seed, index + 2000, 40 * 60_000),
      behavior: job % 3 === 0 ? "recovery" : "baseline",
      researchCount: 1,
      review: false,
      question: `Refresh the synthetic ${story} evidence digest and draft a short summary for the next conversation.`,
      story,
      index,
      background: true,
    });
  }
  if (selectedStories.includes("halo")) {
    const traceId = `${ctx.idPrefix}-failure-product-search-timeout`;
    const rootId = `${traceId}-request`;
    const runId = `${traceId}-agent`;
    const at = finalDay + 11 * HOUR + jitter(ctx.seed, 999_001, 60_000);
    const end = at + 6500 + jitter(ctx.seed, 999_002, 1500);
    const common = {
      project_id: ctx.projectId,
      trace_id: traceId,
      trace_name: "Product search timed out before answering",
      environment: ctx.environment,
      session_id: "",
      user_id: "synthetic-timeout-user",
      level: "ERROR" as const,
      status_message:
        "Synthetic product-document lookup timed out; no answer was produced.",
      created_at: at,
      updated_at: at,
      event_ts: at,
      usage_details: {},
      provided_usage_details: {},
      cost_details: {},
      provided_cost_details: {},
      provided_model_name: null,
      ingestion_api_key: "",
      ingestion_sdk_name: "seed-cli",
      ingestion_sdk_version: "1",
      metadata_names: [
        "demo.behavior",
        "demo.scenario",
        "demo.story",
        "demo.synthetic",
        "demo.workload",
      ],
      metadata_values: [
        "terminal-error",
        "agents-activity-demo",
        "halo",
        "true",
        "failure",
      ],
      tags: ["synthetic", "agents-activity-demo", "terminal-error"],
      input: JSON.stringify({ query: "Which plan includes audit history?" }),
      output: JSON.stringify({
        error: "Product-document search timed out",
        answered: false,
      }),
    };
    const ownership = {
      agent_id: `${ctx.idPrefix}:agent:halo:researcher`,
      agent_name: "Product search",
      agent_run_id: runId,
      agent_identity_source: "gen-ai",
    };
    events.push(
      createEvent({
        ...common,
        id: rootId,
        span_id: rootId,
        parent_span_id: "",
        type: "SPAN",
        name: "Product question",
        is_app_root: true,
        start_time: at,
        end_time: end,
        agent_id: "",
        agent_name: "",
        agent_run_id: "",
        agent_identity_source: "",
      }),
      createEvent({
        ...common,
        ...ownership,
        id: runId,
        span_id: runId,
        parent_span_id: rootId,
        type: "AGENT",
        name: "Product search",
        start_time: at + 10,
        end_time: end - 10,
      }),
      createEvent({
        ...common,
        ...ownership,
        id: `${traceId}-search`,
        span_id: `${traceId}-search`,
        parent_span_id: runId,
        type: "TOOL",
        name: "search_product_docs",
        start_time: at + 20,
        end_time: end - 20,
      }),
    );
    addScore(traceId, end, ctx.environment, false);
  }
  return {
    events,
    scores,
    from,
    to,
    displayFrom,
    comparisonFrom,
    heroSessionId,
    heroTraceIds,
    skillName,
    skills,
  };
}
