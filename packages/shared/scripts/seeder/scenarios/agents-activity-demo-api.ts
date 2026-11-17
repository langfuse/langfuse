import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod/v4";
import { buildAgentsActivityDemoPlan } from "./agents-activity-demo-plan";
import { buildActivityDemoApiPayload } from "./agents-activity-demo-api-plan";
import { agentsActivityDemoScenario } from "./agents-activity-demo";
import {
  createActivityDemoApi,
  seedActivityDemoSkills,
} from "./agents-activity-demo-skills";
import { seedActivityDemoPrompts } from "./agents-activity-demo-prompts";
import { chunk, SeedError, type ScenarioDefinition } from "./types";

const observationSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  type: z.string(),
  name: z.string(),
  environment: z.string(),
  sessionId: z.string().nullish(),
  parentObservationId: z.string().nullish(),
  startTime: z.string(),
  endTime: z.string().nullish(),
  completionStartTime: z.string().nullish(),
  totalCost: z.number().nullish(),
  usageDetails: z.record(z.string(), z.number()).optional(),
});
const scoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataType: z.string(),
  value: z.union([z.number(), z.boolean(), z.string()]),
  subject: z.object({
    kind: z.string(),
    id: z.string(),
    traceId: z.string().optional(),
  }),
});
const cursorMeta = z.object({ cursor: z.string().optional() });
const date = (value: string) => new Date(`${value.replace(" ", "T")}Z`);

/** The authored fixture through public ingestion, without database credentials or tunnels. */
export const agentsActivityDemoApiScenario: ScenarioDefinition = {
  name: "agents-activity-demo-api",
  description:
    "Seed the full synthetic Agents activity history through public OTLP, Skills, Prompts and Scores APIs; no database access required",
  target: "api",
  supportsV4: true,
  flags: agentsActivityDemoScenario.flags.filter(
    ({ flag }) => !flag.startsWith("replay"),
  ),
  async run(ctx, params) {
    const startedAt = Date.now();
    const plan = buildAgentsActivityDemoPlan(ctx, params);
    const traceIds = [
      ...new Set(
        buildActivityDemoApiPayload(plan).events.map((row) => row.trace_id),
      ),
    ];
    const sessionIds = [
      ...new Set(plan.events.map((row) => row.session_id).filter(Boolean)),
    ] as string[];
    const base = `${ctx.baseUrl}/project/${encodeURIComponent(ctx.projectId)}`;
    const range = `dateRange=${plan.displayFrom}-${plan.to}`;
    const counts = {
      agents: new Set(plan.events.map((row) => row.agent_id).filter(Boolean))
        .size,
      events: plan.events.length,
      runs: plan.events.filter((row) => row.type === "AGENT").length,
      modelCalls: plan.events.filter((row) => row.type === "GENERATION").length,
      tools: plan.events.filter((row) => row.type === "TOOL").length,
      traces: traceIds.length,
      sessions: sessionIds.length,
      scores: plan.scores.length,
      managedSkillVersions: plan.skills.length * 2,
      managedPrompts: new Set(
        plan.events
          .filter((row) => row.type === "GENERATION")
          .map((row) => row.agent_id),
      ).size,
    };
    const summary = {
      scenario: "agents-activity-demo-api",
      target: "api" as const,
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds,
      counts,
      verified: {} as Record<string, number>,
      links: [
        `${base}/agents?${range}`,
        `${base}/sessions/${encodeURIComponent(plan.heroSessionId)}`,
        `${base}/agents/${encodeURIComponent(`${ctx.idPrefix}:agent:researcher`)}?${range}&identityKind=id`,
      ],
      historyWindow: {
        from: new Date(plan.from).toISOString(),
        to: new Date(plan.to).toISOString(),
      },
      displayWindow: {
        from: new Date(plan.displayFrom).toISOString(),
        to: new Date(plan.to).toISOString(),
      },
      hero: { sessionId: plan.heroSessionId, traceIds: [] as string[] },
      dryRun: ctx.dryRun,
      durationMs: 0,
    };
    if (ctx.dryRun) {
      summary.durationMs = Date.now() - startedAt;
      return summary;
    }
    const signal = AbortSignal.timeout(20 * 60_000);
    const authenticated = await createActivityDemoApi(
      ctx,
      String(params["credentials-file"] ?? ""),
    );
    const request = (path: string, init?: RequestInit) =>
      authenticated(path, { ...init, signal });
    // Each helper reads back immutable content before telemetry references it.
    for (const skill of plan.skills)
      await seedActivityDemoSkills(
        request,
        ctx.projectId,
        skill.name,
        skill.story,
      );
    await seedActivityDemoPrompts(request, ctx.idPrefix, plan.events);
    const payload = buildActivityDemoApiPayload(plan);
    summary.hero.traceIds = [
      ...new Set(
        payload.events
          .filter((row) => row.session_id === plan.heroSessionId)
          .map((row) => row.trace_id),
      ),
    ];
    summary.links.push(
      ...summary.hero.traceIds.map((id) => `${base}/traces/${id}`),
    );

    const send = async (
      path: string,
      body: unknown,
      headers?: Record<string, string>,
    ) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await request(path, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
        } catch (error) {
          if (attempt >= 2 || signal.aborted) throw error;
          await delay(1000 * (attempt + 1), undefined, { signal });
        }
      }
    };
    // Keep every trace together so intra-batch parentage is available; explicit
    // owner ids also survive streaming or separate batches in real applications.
    for (const [index, resources] of chunk(
      payload.resourceSpans,
      4,
    ).entries()) {
      const response = await send(
        "/otel/v1/traces",
        { resourceSpans: resources },
        {
          "x-langfuse-ingestion-version": "4",
          "x-langfuse-sdk-name": "seed-cli",
          "x-langfuse-sdk-version": "1",
        },
      );
      const accepted = z
        .object({
          partialSuccess: z
            .object({
              rejectedSpans: z.union([z.number(), z.string()]).optional(),
            })
            .optional(),
        })
        .parse(await response.json());
      if (Number(accepted.partialSuccess?.rejectedSpans ?? 0) !== 0)
        throw new SeedError(
          "Activity demo OTLP export partially rejected spans.",
        );
      ctx.log(
        `Accepted historical trace batch ${index + 1}/${Math.ceil(payload.resourceSpans.length / 4)}.`,
      );
    }
    for (const bodies of chunk(payload.scoreBodies, 100)) {
      const response = await send("/scores", bodies);
      if (response.status === 207)
        throw new SeedError(
          "Activity demo score ingestion partially rejected the batch.",
        );
    }

    const expectedEvents = new Map(
      payload.events.map((row) => [`${row.trace_id}:${row.span_id}`, row]),
    );
    const expectedScores = new Map(payload.scores.map((row) => [row.id, row]));
    const foundEvents = new Map<string, z.infer<typeof observationSchema>>();
    const foundScores = new Map<string, z.infer<typeof scoreSchema>>();
    const until = Date.now() + 5 * 60_000;
    do {
      signal.throwIfAborted();
      for (const ids of chunk(traceIds, 40)) {
        let cursor: string | undefined;
        for (let page = 0; page < 100; page++) {
          const query = new URLSearchParams({
            fields: "core,basic,usage,time",
            limit: "1000",
            fromStartTime: summary.historyWindow.from,
            toStartTime: summary.historyWindow.to,
            filter: JSON.stringify([
              {
                column: "traceId",
                type: "stringOptions",
                operator: "any of",
                value: ids,
              },
            ]),
          });
          if (cursor) query.set("cursor", cursor);
          const result = z
            .object({ data: z.array(observationSchema), meta: cursorMeta })
            .parse(await (await request(`/v2/observations?${query}`)).json());
          for (const row of result.data) {
            const key = `${row.traceId}:${row.id}`;
            const expected = expectedEvents.get(key);
            if (!expected)
              throw new SeedError(
                "Activity demo observations readback escaped its trace filter.",
              );
            if (
              row.type !== expected.type ||
              row.name !== expected.name ||
              row.environment !== expected.environment ||
              (row.sessionId ?? "") !== (expected.session_id ?? "") ||
              (row.parentObservationId ?? "") !==
                (expected.parent_span_id ?? "") ||
              Date.parse(row.startTime) !==
                date(expected.start_time).getTime() ||
              Date.parse(row.endTime ?? "") !==
                date(expected.end_time!).getTime()
            )
              throw new SeedError(
                "Activity demo observation identity, hierarchy or historical time readback mismatch.",
              );
            const completionStart = row.completionStartTime
              ? Date.parse(row.completionStartTime)
              : null;
            const expectedCompletionStart = expected.completion_start_time
              ? date(expected.completion_start_time).getTime()
              : null;
            if (completionStart !== expectedCompletionStart)
              throw new SeedError(
                "Activity demo first-token timestamp readback mismatch.",
              );
            foundEvents.set(key, row);
          }
          cursor = result.meta.cursor;
          if (!cursor) break;
          if (page === 99)
            throw new SeedError(
              "Activity demo observations readback exceeded its pagination bound.",
            );
        }
      }
      for (const ids of chunk([...expectedScores.keys()], 100)) {
        let cursor: string | undefined;
        for (let page = 0; page < 100; page++) {
          const query = new URLSearchParams({
            id: ids.join(","),
            limit: "100",
            fields: "core,subject",
            fromTimestamp: summary.historyWindow.from,
            toTimestamp: summary.historyWindow.to,
          });
          if (cursor) query.set("cursor", cursor);
          const result = z
            .object({ data: z.array(scoreSchema), meta: cursorMeta })
            .parse(await (await request(`/v3/scores?${query}`)).json());
          for (const row of result.data) {
            const expected = expectedScores.get(row.id);
            if (!expected)
              throw new SeedError(
                "Activity demo score readback escaped its id filter.",
              );
            const containerKind = expected.trace_id ? "trace" : "session";
            const kind = expected.observation_id
              ? "observation"
              : containerKind;
            const id =
              expected.observation_id ||
              expected.trace_id ||
              expected.session_id;
            const value =
              expected.data_type === "BOOLEAN"
                ? Boolean(expected.value)
                : expected.value;
            if (
              row.name !== expected.name ||
              row.dataType !== expected.data_type ||
              row.value !== value ||
              row.subject.kind !== kind ||
              row.subject.id !== id ||
              (kind === "observation" &&
                row.subject.traceId !== expected.trace_id)
            )
              throw new SeedError(
                "Activity demo score value or subject readback mismatch.",
              );
            foundScores.set(row.id, row);
          }
          cursor = result.meta.cursor;
          if (!cursor) break;
          if (page === 99)
            throw new SeedError(
              "Activity demo score readback exceeded its pagination bound.",
            );
        }
      }
      if (
        foundEvents.size === counts.events &&
        foundScores.size === counts.scores
      )
        break;
      ctx.log(
        `Readback ${foundEvents.size}/${counts.events} observations and ${foundScores.size}/${counts.scores} scores; waiting for ingestion.`,
      );
      await delay(3000, undefined, { signal });
    } while (Date.now() < until);
    if (
      foundEvents.size !== counts.events ||
      foundScores.size !== counts.scores
    )
      throw new SeedError(
        "Activity demo API readback did not match all accepted observations and scores within five minutes.",
      );
    const hero = [...foundEvents.values()].filter(
      (row) => row.sessionId === plan.heroSessionId,
    );
    const heroModels = hero.filter((row) => row.type === "GENERATION");
    const expectedHeroModels = payload.events.filter(
      (row) =>
        row.session_id === plan.heroSessionId && row.type === "GENERATION",
    );
    const heroCost = heroModels.reduce(
      (sum, row) => sum + (row.totalCost ?? 0),
      0,
    );
    const heroTokens = heroModels.reduce(
      (sum, row) => sum + (row.usageDetails?.total ?? 0),
      0,
    );
    if (
      Math.abs(
        heroCost -
          expectedHeroModels.reduce(
            (sum, row) => sum + (row.cost_details.total ?? 0),
            0,
          ),
      ) > 1e-8 ||
      heroTokens !==
        expectedHeroModels.reduce(
          (sum, row) => sum + (row.usage_details.total ?? 0),
          0,
        )
    )
      throw new SeedError(
        "Activity demo hero model usage or cost readback mismatch.",
      );
    summary.verified = {
      events: foundEvents.size,
      scores: foundScores.size,
      runs: [...foundEvents.values()].filter((row) => row.type === "AGENT")
        .length,
      heroTraces: new Set(hero.map((row) => row.traceId)).size,
      heroRuns: hero.filter((row) => row.type === "AGENT").length,
      heroResearcherRuns: hero.filter(
        (row) => row.type === "AGENT" && row.name === "Researcher",
      ).length,
      heroCost,
      heroTokens,
    };
    summary.durationMs = Date.now() - startedAt;
    return summary;
  },
};
