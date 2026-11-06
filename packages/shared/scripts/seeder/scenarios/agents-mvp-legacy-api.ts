import { z } from "zod/v4";
import { AGENT_METADATA_KEYS } from "../../../src/features/agents/api";
import {
  getAgentDetail,
  getAgentRuns,
} from "../../../src/features/agents/server";
import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import { utcDayStartMs } from "./rng";
import { SeedError, type ScenarioContext } from "./types";
import { traceLink } from "./verify";

const ObservationRows = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    }),
  ),
});

/** Exercise the public JSON API and its queued legacy-to-events bridge. */
export async function seedAgentsMvpLegacyApi(
  ctx: ScenarioContext,
  date = "",
): Promise<{
  traceIds: string[];
  links: string[];
  verified: Record<string, number>;
}> {
  const target = new URL(ctx.baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  const preview =
    target.protocol === "https:" &&
    /^pr-\d+\.preview\.langfuse\.com$/.test(target.hostname);
  if (
    (!local && !preview) ||
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw new SeedError(
      "Legacy API fixtures require a local app or disposable PR preview URL.",
    );
  const day = date ? Date.parse(`${date}T00:00:00.000Z`) : utcDayStartMs();
  if (
    !Number.isFinite(day) ||
    (date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        new Date(day).toISOString().slice(0, 10) !== date))
  )
    throw new SeedError("date must be a UTC YYYY-MM-DD");
  const start = day + 12 * 3_600_000;
  const at = new Date(start).toISOString();
  const end = new Date(start + 5_000).toISOString();
  const traceId = `${ctx.idPrefix}-legacy-api-trace`;
  const rootId = `${ctx.idPrefix}-legacy-api-root`;
  const childId = `${ctx.idPrefix}-legacy-api-child`;
  const modelId = `${ctx.idPrefix}-legacy-api-model`;
  const plainId = `${ctx.idPrefix}-legacy-api-plain`;
  const rootName = `${ctx.idPrefix} legacy coordinator`;
  const childName = `${ctx.idPrefix} legacy research`;
  const plainName = `${ctx.idPrefix} legacy utility`;
  const agentId = `${ctx.idPrefix}:legacy-research`;
  const common = {
    traceId,
    environment: ctx.environment,
    startTime: at,
    endTime: end,
  };
  const identity = {
    "gen_ai.agent.id": agentId,
    "gen_ai.agent.name": childName,
  };
  const observations = [
    { type: "agent-create", body: { ...common, id: rootId, name: rootName } },
    {
      type: "agent-create",
      body: {
        ...common,
        id: childId,
        parentObservationId: rootId,
        name: childName,
        metadata: { ...identity, "langfuse.agent.run_id": rootId },
      },
    },
    {
      type: "generation-create",
      body: {
        ...common,
        id: modelId,
        parentObservationId: childId,
        name: "Synthetic JSON API model",
        model: "synthetic-api-model",
        usageDetails: { input: 3, output: 2 },
        costDetails: { total: 0 },
        metadata: { ...identity, "langfuse.agent.run_id": childId },
      },
    },
    {
      type: "span-create",
      body: {
        ...common,
        id: plainId,
        parentObservationId: rootId,
        name: plainName,
      },
    },
  ];
  const links = [
    traceLink(ctx, traceId, start),
    `${ctx.baseUrl}/project/${ctx.projectId}/agents?dateRange=${start - 1_000}-${start + 10_000}&environment=${encodeURIComponent(ctx.environment)}`,
  ];
  if (ctx.dryRun) return { traceIds: [traceId], links, verified: {} };

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${ctx.baseUrl}/api/public${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok)
      throw new SeedError(
        `Legacy fixture API returned HTTP ${response.status}.`,
        "start the matching seeded web and worker, and set NEXTAUTH_URL to that app URL",
      );
    return response;
  };
  const projects = z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(await (await request("/projects")).json());
  if (!projects.data.some((project) => project.id === ctx.projectId))
    throw new SeedError(
      "The synthetic ingestion API key does not belong to --project.",
    );
  const batch = [
    {
      type: "trace-create",
      body: {
        id: traceId,
        name: "Synthetic legacy API discovery",
        timestamp: at,
        environment: ctx.environment,
      },
    },
    ...observations,
  ].map((event, index) => ({
    ...event,
    id: `${ctx.idPrefix}-legacy-api-event-${index}`,
    timestamp: at,
  }));
  const accepted = z.object({ errors: z.array(z.unknown()) }).parse(
    await (
      await request("/ingestion", {
        method: "POST",
        body: JSON.stringify({ batch }),
      })
    ).json(),
  );
  if (accepted.errors.length)
    throw new SeedError(
      "The legacy ingestion API rejected fixture events.",
      "this compatibility check requires a deployment that still accepts non-score legacy JSON events and forwards them to v4; use OTLP for new integrations",
    );

  const scope = {
    projectId: ctx.projectId,
    from: new Date(start - 1_000),
    to: new Date(start + 10_000),
    environment: ctx.environment,
  };
  const rootInput = {
    ...scope,
    identity: { kind: "name" as const, value: rootName },
  };
  const childInput = {
    ...scope,
    identity: { kind: "id" as const, value: agentId },
  };
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    const rows = ObservationRows.parse(
      await (
        await request(
          `/v2/observations?traceId=${encodeURIComponent(traceId)}&limit=20&fields=core,basic,metadata`,
        )
      ).json(),
    ).data;
    const root = rows.find((row) => row.id === rootId);
    const child = rows.find((row) => row.id === childId);
    const model = rows.find((row) => row.id === modelId);
    const plain = rows.find((row) => row.id === plainId);
    if (root && child && model && plain) {
      const [rootAgent, childAgent, childRuns, plainAgent] = await Promise.all([
        getAgentDetail(rootInput),
        getAgentDetail(childInput),
        getAgentRuns({ ...childInput, page: 0, pageSize: 10 }),
        getAgentDetail({
          ...scope,
          identity: { kind: "name", value: plainName },
        }),
      ]);
      if (
        root.type === "AGENT" &&
        root.metadata?.[AGENT_METADATA_KEYS.name] === rootName &&
        root.metadata?.[AGENT_METADATA_KEYS.runId] === rootId &&
        root.metadata?.[AGENT_METADATA_KEYS.source] === "span-name" &&
        child.type === "AGENT" &&
        child.metadata?.[AGENT_METADATA_KEYS.id] === agentId &&
        child.metadata?.[AGENT_METADATA_KEYS.runId] === childId &&
        model.type === "GENERATION" &&
        model.metadata?.[AGENT_METADATA_KEYS.id] === agentId &&
        model.metadata?.[AGENT_METADATA_KEYS.runId] === childId &&
        plain.type === "SPAN" &&
        Object.values(AGENT_METADATA_KEYS).every(
          (key) => !plain.metadata?.[key],
        ) &&
        rootAgent?.stats.runs === 1 &&
        rootAgent.stats.modelCalls === 0 &&
        childAgent?.stats.runs === 1 &&
        childAgent.stats.modelCalls === 1 &&
        childAgent.stats.inputTokens === 3 &&
        childAgent.stats.outputTokens === 2 &&
        childRuns.items.length === 1 &&
        childRuns.items[0].id === childId &&
        childRuns.items[0].modelCalls === 1 &&
        !plainAgent
      ) {
        ctx.log(
          "Legacy JSON API verified: 4 observations, 2 agent runs and 1 explicitly owned model call",
        );
        return {
          traceIds: [traceId],
          links,
          verified: { observations: 4, runs: 2, ownedModelCalls: 1 },
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new SeedError(
    "Legacy JSON API fixture readback did not match normalized metadata and typed agent fields.",
    "confirm the updated worker and observation-to-events bridge are running; queued legacy propagation can take several minutes",
  );
}
