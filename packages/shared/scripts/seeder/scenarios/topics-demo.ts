import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../../src/db";
import {
  clickhouseClient,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  logger,
  type ObservationRecordInsertType,
} from "../../../src/server";
import {
  ensureDefaultTopicFacets,
  writeTopicAssignments,
  writeTopicDefinitions,
  writeTopicSummaries,
} from "../../../src/server/topics";
import type { TopicSummaryState } from "../../../src/topics";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError } from "./types";
import { countRows, tracesListLink } from "./verify";

type Message = Record<string, unknown>;
type FixtureStep = {
  type: "GENERATION" | "TOOL";
  name: string;
  offsetMs: number;
  durationMs: number;
  system?: string;
  tools?: string;
  newMessages?: (Message | "$prevOutput")[];
  input?: unknown;
  output: unknown;
};
type FixtureTrace = {
  name: string;
  tags: string[];
  durationMs: number;
  input: unknown;
  output: unknown;
  steps: FixtureStep[];
};
type FixtureFacet = {
  name: string;
  summaryModel: string;
  embeddingModel: string;
  runConfig: Record<string, unknown>;
  topics: {
    name: string;
    description: string;
    centroid: number[];
    radius: number;
    metadata: Record<string, unknown>;
    representativeTraces: number[];
  }[];
  /** one row per trace index that the facet processed */
  summaries: {
    trace: number;
    state: TopicSummaryState;
    summary: string;
    /** int8 in vectors.bin, scaled by embeddingScale; absent unless complete */
    embeddingScale?: number;
    embedding: number[];
  }[];
  assignments: {
    trace: number;
    topic: number | null;
    distance: number | null;
    runnerUpDistance: number | null;
    coordinates: [number, number];
  }[];
};
type Fixture = {
  blobs: Record<string, unknown>;
  traces: FixtureTrace[];
  facets: FixtureFacet[];
};

const SPAN_DAYS = 7;
const MODEL = "gpt-4.1";
// USD per token, gpt-4.1 list price
const INPUT_PRICE = 2 / 1e6;
const OUTPUT_PRICE = 8 / 1e6;

const hex = (value: string, length: number) =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

// Not part of the shared package build: present in the repo and copied into
// preview worker images only (worker/Dockerfile INCLUDE_SEED_FIXTURES).
const FIXTURE_DIR = path.join(__dirname, "../fixtures/topics-demo");

/** vectors.bin holds all Float32 centroids (facet, topic order), then one int8 embedding per complete summary. */
function loadFixture(): Fixture | null {
  if (!existsSync(FIXTURE_DIR)) return null;
  const read = (file: string) =>
    JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), "utf8"));
  const { blobs, traces } = read("traces.json");
  const { dimensions, facets } = read("topics.json") as {
    dimensions: number;
    facets: FixtureFacet[];
  };
  const vectors = readFileSync(path.join(FIXTURE_DIR, "vectors.bin"));
  let offset = 0;
  for (const topic of facets.flatMap((facet) => facet.topics)) {
    topic.centroid = Array.from({ length: dimensions }, (_, index) =>
      vectors.readFloatLE(offset + index * 4),
    );
    offset += dimensions * 4;
  }
  for (const row of facets.flatMap((facet) => facet.summaries)) {
    const scale = row.embeddingScale;
    row.embedding =
      scale === undefined
        ? []
        : Array.from({ length: dimensions }, (_, index) =>
            Math.fround(vectors.readInt8(offset + index) * scale),
          );
    if (scale !== undefined) offset += dimensions;
  }
  if (offset !== vectors.length)
    throw new SeedError("topics-demo vectors.bin does not match topics.json");
  return { blobs, traces, facets };
}

/** Rebuilds each generation's full chat input from the delta-encoded steps. */
function buildObservations(
  fixture: Fixture,
  trace: FixtureTrace,
  traceId: string,
  projectId: string,
  startMs: number,
): ObservationRecordInsertType[] {
  const history: Message[] = [];
  let previousOutput: Message | null = null;
  return trace.steps.map((step, index) => {
    const start = startMs + step.offsetMs;
    const end = start + step.durationMs;
    const base = {
      id: hex(`${traceId}:${index}`, 16),
      project_id: projectId,
      trace_id: traceId,
      environment: "default",
      parent_observation_id: null,
      start_time: start,
      end_time: end,
      created_at: start,
      updated_at: end,
      event_ts: end,
      metadata: {},
      name: step.name,
    };
    if (step.type === "TOOL")
      return createObservation({
        ...base,
        type: "TOOL",
        input: JSON.stringify(step.input),
        output: JSON.stringify(step.output),
      });
    for (const message of step.newMessages ?? []) {
      if (message === "$prevOutput") {
        if (previousOutput) history.push(previousOutput);
      } else if ("$toolStep" in message) {
        const { $toolStep, ...rest } = message;
        history.push({
          ...rest,
          content: trace.steps[$toolStep as number]!.output,
        });
      } else history.push(message);
    }
    const system = fixture.blobs[step.system!] as Message[];
    const input = JSON.stringify({
      messages: [...system, ...history],
      tools: fixture.blobs[step.tools!],
    });
    const output = JSON.stringify(step.output);
    previousOutput = step.output as Message;
    const usage = {
      input: Math.ceil(input.length / 4),
      output: Math.ceil(output.length / 4),
    };
    const cost = {
      input: usage.input * INPUT_PRICE,
      output: usage.output * OUTPUT_PRICE,
    };
    return createObservation({
      ...base,
      type: "GENERATION",
      input,
      output,
      provided_model_name: MODEL,
      completion_start_time: start + Math.min(400, step.durationMs),
      provided_usage_details: usage,
      usage_details: { ...usage, total: usage.input + usage.output },
      provided_cost_details: cost,
      cost_details: { ...cost, total: cost.input + cost.output },
      total_cost: cost.input + cost.output,
    });
  });
}

export async function clickhouseTableExists(table: string) {
  const result = await clickhouseClient().query({
    query: "EXISTS TABLE {table: Identifier}",
    query_params: { table },
    format: "JSONEachRow",
  });
  const [row] = await result.json<{ result: number | string }>();
  return Number(row?.result) === 1;
}

/**
 * Seeds ~400 realistic agent traces plus a published Topics state (built-in
 * facets, summaries with embeddings, one completed map per facet, and its
 * assignments with map coordinates). Deterministic ids; timestamps re-anchor
 * to the current UTC day, so re-runs on the same day overwrite in place.
 */
export async function seedTopicsDemo(projectId: string) {
  const fixture = loadFixture();
  if (!fixture) {
    logger.warn(`Skipping Topics demo data: no fixture at ${FIXTURE_DIR}.`);
    return null;
  }
  const anchorMs = utcDayStartMs();
  const firstMs = anchorMs - SPAN_DAYS * 86_400_000;
  // Traces end 2h before the anchor so every summary predates the map (anchor - 1h).
  const stride = (SPAN_DAYS * 86_400_000 - 7_200_000) / fixture.traces.length;
  const traceIds = fixture.traces.map((_, index) =>
    hex(`${projectId}:topics-demo:${index}`, 32),
  );
  const startTimes = fixture.traces.map(
    (_, index) =>
      firstMs + Math.round(index * stride) + ((index * 7919) % 60_000),
  );

  const traces = fixture.traces.map((trace, index) =>
    createTrace({
      id: traceIds[index],
      project_id: projectId,
      environment: "default",
      timestamp: startTimes[index],
      name: trace.name,
      session_id: null,
      user_id: null,
      public: false,
      bookmarked: false,
      tags: trace.tags,
      metadata: {},
      input: JSON.stringify(trace.input),
      output: JSON.stringify(trace.output),
      created_at: startTimes[index],
      updated_at: startTimes[index]! + trace.durationMs,
      event_ts: startTimes[index]! + trace.durationMs,
    }),
  );
  const observations = fixture.traces.map((trace, index) =>
    buildObservations(
      fixture,
      trace,
      traceIds[index]!,
      projectId,
      startTimes[index]!,
    ),
  );
  const events = traces.flatMap((trace, index) => [
    { ...traceToEvent(trace), end_time: trace.updated_at },
    ...observations[index]!.map((observation) =>
      observationToEvent(observation, trace),
    ),
  ]);
  await createTracesCh(traces);
  await createObservationsCh(observations.flat());
  await createEventsCh(events);

  const facets = await ensureDefaultTopicFacets(projectId);
  const processedAt = (trace: number) =>
    new Date(startTimes[trace]! + fixture.traces[trace]!.durationMs + 600_000);
  for (const state of fixture.facets) {
    const facet = facets.find(
      (facet) => facet.isBuiltIn && facet.name === state.name,
    );
    if (!facet) throw new SeedError(`Built-in facet ${state.name} is missing`);
    const facetVersion = Math.max(...facet.versions.map((v) => v.version));
    const runId = hex(`${projectId}:topics-demo-run:${state.name}`, 48);
    const createdAt = new Date(anchorMs - 3_600_000);
    const finishedAt = new Date(createdAt.getTime() + 90_000);
    const topics = state.topics.map((topic, index) => {
      const topicId = hex(`${runId}:${index}`, 48);
      return {
        topicVersionId: topicId,
        topicId,
        projectId,
        createdByRunId: runId,
        createdAt: finishedAt.toISOString(),
        tags: [],
        name: topic.name,
        description: topic.description,
        centroid: topic.centroid,
        radius: topic.radius,
        representativeSummaries: topic.representativeTraces.map((trace) => ({
          facetId: facet.id,
          facetVersion,
          traceId: traceIds[trace]!,
          sessionId: null,
        })),
        metadata: topic.metadata,
      };
    });
    await writeTopicDefinitions(topics);
    await writeTopicSummaries(
      state.summaries.map((row) => ({
        projectId,
        facetId: facet.id,
        facetVersion,
        traceId: traceIds[row.trace]!,
        sessionId: null,
        triggerType: "automatic",
        environment: "default",
        traceName: fixture.traces[row.trace]!.name,
        unitStartTime: new Date(startTimes[row.trace]!).toISOString(),
        state: row.state,
        summary: row.summary,
        embedding: row.embedding,
        transcriptId: hex(`${traceIds[row.trace]}:transcript`, 32),
        transcriptVersion: "v1",
        summaryModel: state.summaryModel,
        embeddingModel: state.embeddingModel,
        providedUsageDetails: {},
        usageDetails: {},
        providedCostDetails: {},
        costDetails: {},
        processedAt: processedAt(row.trace).toISOString(),
        metadata: {},
      })),
    );
    await writeTopicAssignments(
      state.assignments.map((row) => ({
        projectId,
        facetId: facet.id,
        facetVersion,
        traceId: traceIds[row.trace]!,
        sessionId: null,
        environment: "default",
        traceName: fixture.traces[row.trace]!.name,
        unitStartTime: new Date(startTimes[row.trace]!).toISOString(),
        summaryProcessedAt: processedAt(row.trace).toISOString(),
        runId,
        topicId: row.topic === null ? null : topics[row.topic]!.topicId,
        topicVersionId:
          row.topic === null ? null : topics[row.topic]!.topicVersionId,
        distance: row.distance,
        runnerUpDistance: row.runnerUpDistance,
        origin: "initial",
        coordinates: row.coordinates,
        assignedAt: finishedAt.toISOString(),
      })),
    );
    const run = {
      projectId,
      facetId: facet.id,
      facetVersion,
      status: "completed",
      config: {
        ...state.runConfig,
        timeRange: {
          from: new Date(firstMs).toISOString(),
          to: createdAt.toISOString(),
        },
        definitionTimeRange: {
          from: finishedAt.toISOString(),
          to: new Date(finishedAt.getTime() + 1).toISOString(),
        },
      },
      createdAt,
      startedAt: createdAt,
      finishedAt,
      topicVersionIds: topics.map((topic) => topic.topicVersionId),
    };
    await prisma.topicClusteringRun.upsert({
      where: { id: runId },
      create: { id: runId, ...run },
      update: run,
    });
  }
  return {
    traceIds,
    observationCount: events.length - traces.length,
    summaryCount: fixture.facets.reduce(
      (sum, facet) => sum + facet.summaries.length,
      0,
    ),
  };
}

export const topicsDemoScenario: ScenarioDefinition = {
  name: "topics-demo",
  description:
    "Realistic Topics demo: ~400 support, workspace and research agent traces with built-in facets, summaries, embeddings, one published map per facet and its assignments. Part of the default seed. No model calls.",
  supportsV4: true,
  flags: [],
  run: async (ctx, params) => {
    const startedAt = Date.now();
    const summary = {
      scenario: "topics-demo",
      target: "clickhouse" as const,
      params,
      projectId: ctx.projectId,
      environment: "default",
      sessionIds: [],
      links: [
        `${ctx.baseUrl}/project/${ctx.projectId}/topics`,
        tracesListLink(ctx),
      ],
      dryRun: ctx.dryRun,
    };
    if (ctx.dryRun)
      return {
        ...summary,
        traceIds: [],
        counts: {},
        verified: {},
        durationMs: Date.now() - startedAt,
      };
    ctx.log("seeding Topics demo traces and published maps");
    const seeded = await seedTopicsDemo(ctx.projectId);
    if (!seeded)
      throw new SeedError(
        "topics-demo fixture files are missing",
        "run from a repository checkout (packages/shared/scripts/seeder/fixtures/topics-demo)",
      );
    const { traceIds, observationCount, summaryCount } = seeded;
    const queryParams = { projectId: ctx.projectId, traceIds };
    const where =
      "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}";
    const counts = {
      traces: traceIds.length,
      observations: observationCount,
      summaries: summaryCount,
    };
    const verified = {
      traces: await countRows(
        "traces",
        "project_id = {projectId: String} AND id IN {traceIds: Array(String)}",
        queryParams,
        "uniqExact(id)",
      ),
      observations: await countRows(
        "observations",
        where,
        queryParams,
        "uniqExact(id)",
      ),
      summaries: await countRows(
        "topic_facet_summaries",
        where,
        queryParams,
        "uniqExact(facet_id, trace_id)",
      ),
    };
    for (const [entity, expected] of Object.entries(counts)) {
      if (verified[entity as keyof typeof verified] !== expected)
        throw new SeedError(
          `Readback mismatch: expected ${expected} ${entity}, found ${verified[entity as keyof typeof verified]}`,
        );
    }
    return {
      ...summary,
      traceIds,
      counts,
      verified,
      durationMs: Date.now() - startedAt,
    };
  },
};
