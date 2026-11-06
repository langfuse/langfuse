import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { EventRecordInsertType } from "../../../src/server/repositories/definitions";
import type { ResourceSpan } from "../../../src/server/otel/OtelIngestionProcessor";
import type { buildAgentsActivityDemoPlan } from "./agents-activity-demo-plan";
import { countRows } from "./verify";
import { SeedError, type ScenarioContext } from "./types";

type Plan = ReturnType<typeof buildAgentsActivityDemoPlan>;
type Request = (path: string, init?: RequestInit) => Promise<Response>;
type OtlpJsonSpan = Omit<
  NonNullable<NonNullable<ResourceSpan["scopeSpans"]>[number]["spans"]>[number],
  "traceId" | "spanId" | "parentSpanId"
> & { traceId: string; spanId: string; parentSpanId?: string };
type OtlpJsonResourceSpan = {
  resource: ResourceSpan["resource"];
  scopeSpans: {
    scope: { name: string; version: string };
    spans: OtlpJsonSpan[];
  }[];
};
const millis = (value: string) => Date.parse(`${value.replace(" ", "T")}Z`);
const datetime = (value: number) =>
  new Date(value).toISOString().replace("T", " ").replace("Z", "");
const digest = (value: string, length: number) =>
  createHash("sha256").update(value).digest("hex").slice(0, length);
const metadata = (event: EventRecordInsertType, key: string) =>
  event.metadata_values?.[event.metadata_names?.indexOf(key) ?? -1];

export function activityDemoReplaySettings(
  params: Record<string, string | number | boolean>,
) {
  if (params.replay !== true) return null;
  const count = Number(params["replay-count"] ?? 6);
  const intervalMs = Number(params["replay-interval-ms"] ?? 5000);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20 ||
    !Number.isInteger(intervalMs) ||
    intervalMs < 1000 ||
    intervalMs > 15_000 ||
    (count - 1) * intervalMs > 240_000
  )
    throw new SeedError(
      "Replay requires 1–20 batches, a 1000–15000 ms interval, and at most four minutes of scheduled delays.",
    );
  return { count, intervalMs, deadlineMs: 300_000 };
}

/** Fresh completed work, with live IDs separate from the deterministic history. No provider is called. */
export function buildActivityDemoLiveBatch(
  ctx: ScenarioContext,
  plan: Plan,
  nonce: string,
  batch: number,
  now: number,
) {
  const roots = plan.events.filter(
    (event) => event.is_app_root && event.session_id,
  );
  const stories = [
    ...new Set(roots.map((event) => metadata(event, "demo.story"))),
  ];
  const selected = stories.map((story) => {
    const candidates = roots.filter(
      (event) => metadata(event, "demo.story") === story,
    );
    return candidates[batch % candidates.length]!;
  });
  if (batch % 3 === 2) {
    const backgrounds = plan.events.filter(
      (event) =>
        event.is_app_root &&
        !event.session_id &&
        metadata(event, "demo.workload") === "background",
    );
    if (backgrounds.length)
      selected.push(backgrounds[batch % backgrounds.length]!);
  }
  const events: EventRecordInsertType[] = [];
  const scores: Plan["scores"] = [];
  for (const [index, root] of selected.entries()) {
    const original = plan.events.filter(
      (event) =>
        event.trace_id === root.trace_id &&
        event.agent_id !== `${ctx.idPrefix}:agent:halo:router`,
    );
    const traceId = digest(`${nonce}:${batch}:${root.trace_id}`, 32);
    const spanIds = new Map(
      original.map((event) => [
        event.span_id,
        digest(`${nonce}:${batch}:${event.span_id}`, 16),
      ]),
    );
    const shift = now - 1 - index * 1000 - millis(root.end_time!);
    const sessionId = root.session_id
      ? `${ctx.idPrefix}-live-${nonce}-${metadata(root, "demo.story")}`
      : "";
    for (const event of original)
      events.push({
        ...event,
        id: spanIds.get(event.span_id)!,
        span_id: spanIds.get(event.span_id)!,
        trace_id: traceId,
        parent_span_id: spanIds.get(event.parent_span_id ?? "") ?? "",
        agent_run_id: spanIds.get(event.agent_run_id ?? "") ?? "",
        session_id: sessionId,
        start_time: datetime(millis(event.start_time) + shift),
        end_time: datetime(millis(event.end_time!) + shift),
        completion_start_time: event.completion_start_time
          ? datetime(millis(event.completion_start_time) + shift)
          : null,
        created_at: datetime(now),
        updated_at: datetime(now),
        event_ts: datetime(now),
        metadata_names: [...(event.metadata_names ?? []), "demo.live"],
        metadata_values: [...(event.metadata_values ?? []), "true"],
      });
    for (const score of plan.scores.filter(
      (score) =>
        score.trace_id === root.trace_id &&
        (!score.observation_id || spanIds.has(score.observation_id)),
    )) {
      const at = datetime(millis(score.timestamp) + shift);
      scores.push({
        ...score,
        id: `${ctx.idPrefix}-live-${nonce}-${digest(`${batch}:${score.id}`, 24)}`,
        trace_id: traceId,
        observation_id: score.observation_id
          ? spanIds.get(score.observation_id)!
          : null,
        timestamp: at,
        created_at: at,
        updated_at: at,
        event_ts: at,
      });
    }
  }
  const owners = new Map(
    events
      .filter((event) => event.type === "AGENT")
      .map((event) => [event.span_id, event]),
  );
  const resourceSpans: OtlpJsonResourceSpan[] = selected.map((root) => {
    const traceId = digest(`${nonce}:${batch}:${root.trace_id}`, 32);
    return {
      resource: {
        attributes: [
          {
            key: "service.name",
            value: { stringValue: root.service_name ?? "synthetic-agent-demo" },
          },
          ...(root.service_version
            ? [
                {
                  key: "service.version",
                  value: { stringValue: root.service_version },
                },
              ]
            : []),
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: root.scope_name || "langfuse-seed-cli",
            version: root.scope_version || "1",
          },
          spans: events
            .filter((event) => event.trace_id === traceId)
            .map((event) => {
              const values: Record<string, string> = {
                "langfuse.observation.type": event.type.toLowerCase(),
                "langfuse.observation.level": event.level,
                "langfuse.environment": event.environment,
                "langfuse.trace.name": event.trace_name ?? event.name,
                "langfuse.trace.tags": JSON.stringify(event.tags ?? []),
                "session.id": event.session_id ?? "",
                "user.id": event.user_id ?? "",
                "langfuse.observation.input": event.input ?? "",
                "langfuse.observation.output": event.output ?? "",
                "langfuse.observation.metadata": JSON.stringify(
                  Object.fromEntries(
                    (event.metadata_names ?? [])
                      .map(
                        (key, i) => [key, event.metadata_values?.[i]] as const,
                      )
                      .filter(([key]) => !key.startsWith("attributes.")),
                  ),
                ),
              };
              for (const [index, key] of (event.metadata_names ?? []).entries())
                if (key.startsWith("attributes."))
                  values[key.slice("attributes.".length)] =
                    event.metadata_values?.[index] ?? "";
              if (event.version) values["langfuse.version"] = event.version;
              if (event.release) values["langfuse.release"] = event.release;
              if (event.status_message)
                values["langfuse.observation.status_message"] =
                  event.status_message;
              if (event.agent_id) {
                values["langfuse.agent.id"] = event.agent_id;
                values["gen_ai.agent.name"] = event.agent_name ?? "";
                values["langfuse.agent.run_id"] = event.agent_run_id ?? "";
              }
              if (event.type === "AGENT")
                values["gen_ai.operation.name"] = "invoke_agent";
              if (event.type === "TOOL") {
                values["gen_ai.operation.name"] = "execute_tool";
                values["gen_ai.tool.name"] = event.name;
              }
              if (event.type === "GENERATION") {
                values["gen_ai.operation.name"] = "chat";
                values["langfuse.observation.model.name"] =
                  event.provided_model_name ?? "";
                values["langfuse.observation.usage_details"] = JSON.stringify(
                  event.usage_details,
                );
                values["langfuse.observation.cost_details"] = JSON.stringify(
                  event.cost_details,
                );
                if (event.model_parameters)
                  values["langfuse.observation.model.parameters"] =
                    event.model_parameters;
                if (event.prompt_name && event.prompt_version !== null) {
                  values["langfuse.observation.prompt.name"] =
                    event.prompt_name;
                  values["langfuse.observation.prompt.version"] = String(
                    event.prompt_version,
                  );
                }
              }
              const available = owners.get(
                event.agent_run_id ?? "",
              )?.skills_available;
              if (available?.length)
                values["langfuse.observation.skills_available"] =
                  JSON.stringify(
                    available.map((skill) => ({
                      name: skill.skillName,
                      version: skill.skillVersion,
                    })),
                  );
              return {
                traceId: event.trace_id,
                spanId: event.span_id,
                parentSpanId: event.parent_span_id || undefined,
                name: event.name,
                kind: 1,
                startTimeUnixNano: (
                  BigInt(millis(event.start_time)) * 1_000_000n
                ).toString(),
                endTimeUnixNano: (
                  BigInt(millis(event.end_time!)) * 1_000_000n
                ).toString(),
                attributes: [
                  ...Object.entries(values).map(([key, value]) => ({
                    key,
                    value: { stringValue: value },
                  })),
                  {
                    key: "langfuse.internal.is_app_root",
                    value: { boolValue: event.is_app_root },
                  },
                ],
                status: {
                  code: event.level === "ERROR" ? 2 : 1,
                  message: event.status_message ?? undefined,
                },
              };
            }),
        },
      ],
    };
  });
  const scoreBodies = scores.map((score) => ({
    id: score.id,
    name: score.name,
    traceId: score.trace_id,
    observationId: score.observation_id,
    environment: score.environment,
    value: score.value,
    dataType: score.data_type,
    source: "API",
    timestamp: new Date(millis(score.timestamp)).toISOString(),
    comment: score.comment,
    metadata: score.metadata,
  }));
  return { events, scores, resourceSpans, scoreBodies };
}

export async function runActivityDemoReplay(
  ctx: ScenarioContext,
  plan: Plan,
  request: Request,
  settings: NonNullable<ReturnType<typeof activityDemoReplaySettings>>,
) {
  const signal = AbortSignal.timeout(settings.deadlineMs);
  const nonce = `${Date.now()}-${process.pid}`;
  const events: EventRecordInsertType[] = [];
  const scores: Plan["scores"] = [];
  for (let batch = 0; batch < settings.count; batch++) {
    signal.throwIfAborted();
    const live = buildActivityDemoLiveBatch(
      ctx,
      plan,
      nonce,
      batch,
      Date.now(),
    );
    const response = await request("/otel/v1/traces", {
      method: "POST",
      signal,
      headers: {
        "x-langfuse-ingestion-version": "4",
        "x-langfuse-sdk-name": "seed-cli",
        "x-langfuse-sdk-version": "1",
      },
      body: JSON.stringify({ resourceSpans: live.resourceSpans }),
    });
    const accepted = (await response.json()) as {
      partialSuccess?: { rejectedSpans?: number | string };
    };
    if (Number(accepted.partialSuccess?.rejectedSpans ?? 0) !== 0)
      throw new SeedError("Live replay OTLP export partially rejected spans.");
    const scored = await request("/scores", {
      method: "POST",
      signal,
      body: JSON.stringify(live.scoreBodies),
    });
    if (scored.status === 207)
      throw new SeedError(
        "Live replay score ingestion partially rejected the batch.",
      );
    events.push(...live.events);
    scores.push(...live.scores);
    ctx.log(
      `Ingested synthetic live batch ${batch + 1}/${settings.count}: ${live.events.length} observations. No provider calls.`,
    );
    if (batch + 1 < settings.count)
      await delay(settings.intervalMs, undefined, { signal });
  }
  const traceIds = [...new Set(events.map((event) => event.trace_id))];
  const sessionIds = [
    ...new Set(
      events
        .map((event) => event.session_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const from = Math.min(...events.map((event) => millis(event.start_time)));
  const to = Date.now();
  const queryParams = {
    projectId: ctx.projectId,
    traceIds,
    scoreIds: scores.map((score) => score.id),
    from: datetime(from),
    to: datetime(to),
  };
  const where =
    "project_id = {projectId:String} AND start_time >= {from:DateTime64(3)} AND start_time < {to:DateTime64(3)} AND trace_id IN {traceIds:Array(String)}";
  const expectedRuns = events.filter((event) => event.type === "AGENT").length;
  const expectedLoads = events.filter(
    (event) => (event.skills_resource_loaded?.length ?? 0) > 0,
  ).length;
  const verifyUntil = Date.now() + 60_000;
  let verified = { events: 0, runs: 0, scores: 0, skillLoads: 0 };
  do {
    signal.throwIfAborted();
    verified = {
      events: await countRows(
        "events_core",
        where,
        queryParams,
        "uniqExact((trace_id, span_id))",
      ),
      runs: await countRows(
        "events_core",
        where,
        queryParams,
        "uniqExactIf((trace_id, span_id), type = 'AGENT' AND agent_run_id = span_id AND agent_id != '')",
      ),
      skillLoads: await countRows(
        "events_core",
        where,
        queryParams,
        "uniqExactIf((trace_id, span_id), notEmpty(skills_resource_loaded) AND arrayAll(skill -> isNotNull(skill.langfuseSkillId) AND isNotNull(skill.skillVersion), skills_resource_loaded))",
      ),
      scores: await countRows(
        "scores",
        "project_id = {projectId:String} AND timestamp >= {from:DateTime64(3)} AND timestamp < {to:DateTime64(3)} AND id IN {scoreIds:Array(String)}",
        queryParams,
        "uniqExact(id)",
      ),
    };
    if (
      verified.events === events.length &&
      verified.runs === expectedRuns &&
      verified.scores === scores.length &&
      verified.skillLoads === expectedLoads
    )
      return {
        nonce,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        traceIds,
        sessionIds,
        counts: {
          events: events.length,
          runs: expectedRuns,
          scores: scores.length,
          skillLoads: expectedLoads,
        },
        verified,
      };
    await delay(2000, undefined, { signal });
  } while (Date.now() < verifyUntil);
  throw new SeedError(
    "Live replay readback did not match the accepted spans, agent runs, managed skill loads and scores within one minute.",
  );
}
