import { prisma } from "../../../src/db";
import { encodeFiltersGeneric } from "../../../src/features/filters/filterQueryEncoding";
import {
  createEventsCh,
  createScoresCh,
} from "../../../src/server/test-utils/clickhouse-helpers";
import {
  buildAgentsActivityDemoPlan,
  activityDemoWriteRows,
  ACTIVITY_DEMO_PENDING_SKILL,
} from "./agents-activity-demo-plan";
import {
  createActivityDemoApi,
  seedActivityDemoSkills,
} from "./agents-activity-demo-skills";
import {
  activityDemoReplaySettings,
  runActivityDemoReplay,
} from "./agents-activity-demo-replay";
import { seedActivityDemoPrompts } from "./agents-activity-demo-prompts";
import { chunk, SeedError, type ScenarioDefinition } from "./types";
import { countRows, escapeLike, sessionLink, traceLink } from "./verify";
import { utcDayStartMs } from "./rng";

/** Curated activity history, separate from the Agents accounting/performance regression fixture. */
export const agentsActivityDemoScenario: ScenarioDefinition = {
  name: "agents-activity-demo",
  description:
    "Synthetic multi-agent research conversations, repeated invocations, scored outcomes and sessionless jobs across a varied history",
  supportsV4: true,
  flags: [
    {
      flag: "date",
      type: "string",
      default: "",
      description:
        "Final completed UTC day YYYY-MM-DD (yesterday by default); no future activity",
    },
    {
      flag: "days",
      type: "number",
      default: 14,
      description: "History window in completed UTC days (1–30)",
    },
    {
      flag: "conversations",
      type: "number",
      default: 120,
      description:
        "Conversations including the fixed three-trace hero (1–1000)",
    },
    {
      flag: "background-jobs",
      type: "number",
      default: 12,
      description: "Separate sessionless research jobs (0–500)",
    },
    {
      flag: "candidate-environment",
      type: "string",
      default: "staging",
      description:
        "Second environment for a distinct comparison cohort; must differ from --environment",
    },
    {
      flag: "stories",
      type: "string",
      default: "agentique,halo,coding",
      description:
        "Comma-separated synthetic stories; the fixed Agentique hero is always included",
    },
    {
      flag: "replay",
      type: "boolean",
      default: false,
      description:
        "Opt in to bounded live OTLP replay after static history (no provider calls or daemon)",
    },
    {
      flag: "replay-count",
      type: "number",
      default: 6,
      description: "Live batches when replay is enabled (1–20)",
    },
    {
      flag: "replay-interval-ms",
      type: "number",
      default: 5000,
      description:
        "Delay between live batches (1000–15000 ms); replay has a five-minute deadline",
    },
    {
      flag: "credentials-file",
      type: "string",
      default: "",
      description:
        "Private JSON {publicKey,secretKey} for --project; omitted uses the synthetic seed key",
    },
  ],
  async run(ctx, params) {
    const startedAt = Date.now();
    const replay = activityDemoReplaySettings(params);
    const plan = buildAgentsActivityDemoPlan(ctx, params);
    if (replay && plan.to !== utcDayStartMs())
      throw new SeedError(
        "Live replay requires history ending yesterday; omit --date or choose the last completed UTC day so the live window retains its seeded baseline.",
      );
    const traceIds = [...new Set(plan.events.map((event) => event.trace_id))];
    const sessionIds = [
      ...new Set(
        plan.events
          .map((event) => event.session_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const runs = plan.events.filter((event) => event.type === "AGENT");
    const models = plan.events.filter((event) => event.type === "GENERATION");
    const heroRuns = runs.filter(
      (event) => event.session_id === plan.heroSessionId,
    );
    const heroModels = models.filter(
      (event) => event.session_id === plan.heroSessionId,
    );
    const failureRoots = plan.events.filter(
      (event) => event.is_app_root && event.level === "ERROR",
    );
    const inDisplay = (event: (typeof plan.events)[number]) =>
      Date.parse(`${event.start_time.replace(" ", "T")}Z`) >= plan.displayFrom;
    const counts: Record<string, number> = {
      agents: new Set(runs.map((event) => event.agent_id)).size,
      terminalFailureTraces: failureRoots.length,
      terminalFailureRuns: runs.filter((event) => event.level === "ERROR")
        .length,
      failedToolCalls: plan.events.filter(
        (event) => event.type === "TOOL" && event.level === "ERROR",
      ).length,
      displayAgents: new Set(
        runs.filter(inDisplay).map((event) => event.agent_id),
      ).size,
      managedSkillVersions: plan.skills.length * 2,
      managedPrompts: new Set(models.map((event) => event.agent_id)).size,
      displayRuns: runs.filter(inDisplay).length,
      baselineOnlyAgentRuns: runs.filter(
        (event) => event.agent_id === `${ctx.idPrefix}:agent:halo:router`,
      ).length,
      displayBaselineOnlyAgentRuns: runs.filter(
        (event) =>
          event.agent_id === `${ctx.idPrefix}:agent:halo:router` &&
          inDisplay(event),
      ).length,
      sessions: sessionIds.length,
      traces: traceIds.length,
      runs: runs.length,
      modelCalls: models.length,
      tools: plan.events.filter((event) => event.type === "TOOL").length,
      events: plan.events.length,
      scores: plan.scores.length,
      backgroundTraces: traceIds.filter((id) =>
        id.startsWith(`${ctx.idPrefix}-background-`),
      ).length,
      skillLoads: plan.events.filter(
        (event) => (event.skills_resource_loaded?.length ?? 0) > 0,
      ).length,
      heroSessions: new Set(heroRuns.map((event) => event.session_id)).size,
      heroTraces: new Set(heroRuns.map((event) => event.trace_id)).size,
      heroRuns: heroRuns.length,
      heroModelCalls: heroModels.length,
      heroTokens: heroModels.reduce(
        (sum, event) => sum + (event.usage_details.total ?? 0),
        0,
      ),
      heroCost: Number(
        heroModels
          .reduce((sum, event) => sum + (event.cost_details.total ?? 0), 0)
          .toFixed(8),
      ),
    };
    for (const role of ["orchestrator", "researcher", "reviewer", "writer"])
      counts[`hero${role.charAt(0).toUpperCase()}${role.slice(1)}Runs`] =
        heroRuns.filter(
          (event) => event.agent_id === `${ctx.idPrefix}:agent:${role}`,
        ).length;
    const range = new URLSearchParams({
      dateRange: `${plan.displayFrom}-${plan.to}`,
    });
    const base = `${ctx.baseUrl}/project/${encodeURIComponent(ctx.projectId)}`;
    const summary = {
      scenario: "agents-activity-demo",
      target: "clickhouse" as const,
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds,
      counts,
      verified: {} as Record<string, number>,
      historyWindow: {
        from: new Date(plan.from).toISOString(),
        to: new Date(plan.to).toISOString(),
      },
      displayWindow: {
        from: new Date(plan.displayFrom).toISOString(),
        to: new Date(plan.to).toISOString(),
      },
      comparisonWindow: {
        from: new Date(plan.comparisonFrom).toISOString(),
        to: new Date(plan.displayFrom).toISOString(),
        fullySeeded: plan.comparisonFrom >= plan.from,
      },
      hero: {
        sessionId: plan.heroSessionId,
        traces: plan.heroTraceIds.map((traceId) => ({
          traceId,
          researcherRuns: heroRuns.filter(
            (event) =>
              event.trace_id === traceId &&
              event.agent_id === `${ctx.idPrefix}:agent:researcher`,
          ).length,
        })),
      },
      links: [
        `${base}/agents?${range}`,
        `${base}/agents?dateRange=${plan.from}-${plan.to}`,
        ...[
          ctx.environment,
          String(params["candidate-environment"] ?? "staging"),
        ].map(
          (environment) =>
            `${base}/agents?${range}&filter=${encodeURIComponent(encodeFiltersGeneric([{ column: "environment", type: "stringOptions", operator: "any of", value: [environment] }]))}`,
        ),
        sessionLink(ctx, plan.heroSessionId),
        ...plan.heroTraceIds.map((traceId) =>
          traceLink(
            ctx,
            traceId,
            Date.parse(
              `${plan.events.find((event) => event.trace_id === traceId && event.is_app_root)!.start_time.replace(" ", "T")}Z`,
            ),
          ),
        ),
        ...failureRoots.map((event) =>
          traceLink(
            ctx,
            event.trace_id,
            Date.parse(`${event.start_time.replace(" ", "T")}Z`),
          ),
        ),
        `${base}/agents/${encodeURIComponent(`${ctx.idPrefix}:agent:researcher`)}?${range}&identityKind=id`,
      ],
      dryRun: ctx.dryRun,
      replay: {
        enabled: replay !== null,
        plannedBatches: replay?.count ?? 0,
        intervalMs: replay?.intervalMs ?? 0,
        result: null as Awaited<
          ReturnType<typeof runActivityDemoReplay>
        > | null,
      },
      durationMs: 0,
    };
    ctx.log(
      `Static synthetic history: ${summary.historyWindow.from} to ${summary.historyWindow.to} (exclusive).`,
    );
    ctx.log(
      `Hero: ${counts.heroSessions} session, ${counts.heroTraces} traces, ${counts.heroResearcherRuns} researcher agent runs (${summary.hero.traces.map((trace) => trace.researcherRuns).join(" + ")}); ${counts.heroRuns} total agent runs. Background jobs are separate.`,
    );
    if (!ctx.dryRun) {
      const request = await createActivityDemoApi(
        ctx,
        String(params["credentials-file"] ?? ""),
      );
      const skills: Awaited<ReturnType<typeof seedActivityDemoSkills>> = [];
      for (const skill of plan.skills)
        skills.push(
          ...(await seedActivityDemoSkills(
            request,
            ctx.projectId,
            skill.name,
            skill.story,
          )),
        );
      const prompts = await seedActivityDemoPrompts(
        request,
        ctx.idPrefix,
        plan.events,
      );
      for (const event of plan.events)
        for (const field of [
          "skills_available",
          "skills_resource_loaded",
        ] as const)
          for (const reference of event[field] ?? []) {
            const stored = skills.find(
              (skill) =>
                skill.name === reference.skillName &&
                skill.version === reference.skillVersion,
            );
            if (
              !stored ||
              reference.langfuseSkillId !== ACTIVITY_DEMO_PENDING_SKILL
            )
              throw new SeedError(
                "The activity demo contains an unresolved managed skill reference.",
              );
            reference.langfuseSkillId = stored.id;
          }
      for (const sessionId of sessionIds) {
        const first = plan.events
          .filter((event) => event.session_id === sessionId)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))[0]!;
        await prisma.traceSession.upsert({
          where: { id_projectId: { id: sessionId, projectId: ctx.projectId } },
          update: {},
          create: {
            id: sessionId,
            projectId: ctx.projectId,
            environment: first.environment,
            createdAt: new Date(`${first.start_time.replace(" ", "T")}Z`),
          },
        });
      }
      const writeVersion = Date.now();
      for (const batch of chunk(
        activityDemoWriteRows(plan.events, writeVersion),
        10_000,
      ))
        await createEventsCh(batch);
      for (const batch of chunk(
        activityDemoWriteRows(plan.scores, writeVersion),
        10_000,
      ))
        await createScoresCh(batch);
      const queryParams = {
        projectId: ctx.projectId,
        prefix: `${escapeLike(ctx.idPrefix)}-%`,
        from: summary.historyWindow.from.replace("T", " ").replace("Z", ""),
        to: summary.historyWindow.to.replace("T", " ").replace("Z", ""),
        heroSession: plan.heroSessionId,
        researcher: `${ctx.idPrefix}:agent:researcher`,
        skillIds: skills.map((skill) => skill.id),
        displayFrom: new Date(plan.displayFrom)
          .toISOString()
          .replace("T", " ")
          .replace("Z", ""),
        retiredAgent: `${ctx.idPrefix}:agent:halo:router`,
      };
      const where =
        "project_id = {projectId:String} AND start_time >= {from:DateTime64(3)} AND start_time < {to:DateTime64(3)} AND trace_id LIKE {prefix:String}";
      const expressions = {
        terminalFailureTraces:
          "uniqExactIf(trace_id, type = 'AGENT' AND level = 'ERROR')",
        terminalFailureRuns:
          "uniqExactIf((trace_id, span_id), type = 'AGENT' AND level = 'ERROR')",
        failedToolCalls:
          "uniqExactIf((trace_id, span_id), type = 'TOOL' AND level = 'ERROR')",
        displayRuns:
          "uniqExactIf((trace_id, span_id), type = 'AGENT' AND start_time >= {displayFrom:DateTime64(3)})",
        baselineOnlyAgentRuns:
          "uniqExactIf((trace_id, span_id), type = 'AGENT' AND agent_id = {retiredAgent:String})",
        displayBaselineOnlyAgentRuns:
          "uniqExactIf((trace_id, span_id), type = 'AGENT' AND agent_id = {retiredAgent:String} AND start_time >= {displayFrom:DateTime64(3)})",
        events: "uniqExact((trace_id, span_id))",
        traces: "uniqExact(trace_id)",
        sessions: "uniqExactIf(session_id, session_id != '')",
        runs: "uniqExactIf((trace_id, span_id), type = 'AGENT' AND agent_run_id = span_id)",
        tools: "uniqExactIf((trace_id, span_id), type = 'TOOL')",
        modelCalls: "uniqExactIf((trace_id, span_id), type = 'GENERATION')",
        skillLoads:
          "uniqExactIf((trace_id, span_id), arrayExists(skill -> skill.langfuseSkillId IN {skillIds:Array(String)}, skills_resource_loaded))",
        heroRuns:
          "uniqExactIf((trace_id, span_id), type = 'AGENT' AND session_id = {heroSession:String})",
        heroResearcherRuns:
          "uniqExactIf((trace_id, span_id), type = 'AGENT' AND session_id = {heroSession:String} AND agent_id = {researcher:String})",
      };
      for (const [key, expression] of Object.entries(expressions)) {
        summary.verified[key] = await countRows(
          "events_core",
          where,
          queryParams,
          expression,
        );
        if (summary.verified[key] !== counts[key])
          throw new SeedError(
            `Activity demo ${key} readback mismatch; use a fresh --id-prefix when changing scenario flags.`,
          );
      }
      summary.verified.scores = await countRows(
        "scores",
        "project_id = {projectId:String} AND timestamp >= {from:DateTime64(3)} AND timestamp < {to:DateTime64(3)} AND id LIKE {prefix:String}",
        queryParams,
        "uniqExact(id)",
      );
      if (summary.verified.scores !== counts.scores)
        throw new SeedError("Activity demo score readback mismatch.");
      summary.verified.managedSkillVersions = skills.length;
      summary.verified.managedPrompts = prompts.length;
      if (prompts.length !== counts.managedPrompts)
        throw new SeedError("Activity demo managed prompt readback mismatch.");
      for (const prompt of prompts)
        summary.links.push(
          `${base}/prompts/${encodeURIComponent(prompt.name)}`,
        );
      for (const skill of plan.skills)
        summary.links.push(`${base}/skills/${encodeURIComponent(skill.name)}`);
      if (replay) {
        summary.replay.result = await runActivityDemoReplay(
          ctx,
          plan,
          request,
          replay,
        );
        const live = summary.replay.result;
        summary.links.push(
          `${base}/agents?dateRange=${Date.parse(live.to) - (plan.to - plan.displayFrom)}-${Date.parse(live.to)}`,
        );
        for (const sessionId of live.sessionIds)
          summary.links.push(sessionLink(ctx, sessionId));
      }
    }
    summary.durationMs = Date.now() - startedAt;
    return summary;
  },
};
