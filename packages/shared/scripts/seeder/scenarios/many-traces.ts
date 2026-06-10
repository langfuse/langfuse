import { readFileSync } from "fs";
import path from "path";
import { clickhouseClient } from "../../../src/server";
import { ClickHouseQueryBuilder } from "../utils/clickhouse-builder";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, tracesListLink } from "./verify";

/**
 * Loads the bundled large fixtures, sliced exactly like SeederOrchestrator so
 * the inline INSERT ... SELECT FROM numbers() SQL stays under ClickHouse's
 * max_query_size.
 */
const loadFileContent = () => {
  const utilsDir = path.join(__dirname, "../utils");
  const nestedJson = JSON.parse(
    readFileSync(path.join(utilsDir, "nested_json.json"), "utf-8"),
  );
  const chatMlJson = JSON.parse(
    readFileSync(path.join(utilsDir, "chat_ml_json.json"), "utf-8"),
  );
  return {
    heavyMarkdown: readFileSync(path.join(utilsDir, "markdown.txt"), "utf-8"),
    nestedJson: {
      ...nestedJson,
      products: nestedJson.products?.slice(0, 3) ?? [],
    },
    chatMlJson: {
      ...chatMlJson,
      messages: chatMlJson.messages?.slice(0, 4) ?? [],
    },
  };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const count = params["count"] as number;
  const days = params["days"] as number;
  const observationsPerTrace = params["observations-per-trace"] as number;
  const scoresPerTrace = params["scores-per-trace"] as number;
  const richPayloads = params["rich-payloads"] as boolean;

  const builder = new ClickHouseQueryBuilder();
  const fileContent = richPayloads ? loadFileContent() : undefined;
  const counts: Record<string, number> = {
    traces: count,
    observations: count * observationsPerTrace,
    scores: count * scoresPerTrace,
  };
  const links = [tracesListLink(ctx)];

  if (ctx.dryRun) {
    return {
      scenario: "many-traces",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [],
      sessionIds: [],
      counts,
      verified: {},
      links,
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // Bulk SQL uses fixed `trace-bulk-{n}-{projectId-suffix}` ids, so re-runs
  // with the same count overwrite rather than duplicate.
  ctx.log(
    `bulk-inserting ${count} traces, ${counts.observations} observations, ${counts.scores} scores over ${days} day(s)`,
  );
  const queries = [
    builder.buildBulkTracesInsert(
      ctx.projectId,
      count,
      ctx.environment,
      fileContent,
      { numberOfDays: days },
    ),
    builder.buildBulkObservationsInsert(
      ctx.projectId,
      count,
      observationsPerTrace,
      ctx.environment,
      fileContent,
      { numberOfDays: days },
    ),
    builder.buildBulkScoresInsert(
      ctx.projectId,
      count,
      scoresPerTrace,
      ctx.environment,
      { numberOfDays: days },
    ),
  ];
  for (const query of queries) {
    await clickhouseClient().command({
      query,
      clickhouse_settings: { wait_end_of_query: 1 },
    });
  }

  const idSuffix = ctx.projectId.slice(-8);
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND id LIKE {prefix: String}`,
      { projectId: ctx.projectId, prefix: `trace-bulk-%-${idSuffix}` },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND id LIKE {prefix: String}`,
      { projectId: ctx.projectId, prefix: `obs-bulk-%-${idSuffix}` },
      "uniqExact(id)",
    ),
  };

  if (verified.traces < count) {
    throw new SeedError(
      `Readback mismatch: expected at least ${count} bulk traces, found ${verified.traces}`,
    );
  }

  return {
    scenario: "many-traces",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts,
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const manyTracesScenario: ScenarioDefinition = {
  name: "many-traces",
  description:
    "Bulk traces/observations/scores via ClickHouse numbers() SQL for trace-list and filter performance work. Fast even for 100k+ traces; ids are deterministic so re-runs do not duplicate.",
  supportsV4: false,
  flags: [
    {
      flag: "count",
      type: "number",
      default: 10_000,
      description: "number of traces",
    },
    {
      flag: "days",
      type: "number",
      default: 3,
      description: "spread timestamps over the past N days",
    },
    {
      flag: "observations-per-trace",
      type: "number",
      default: 5,
      description: "observations per trace",
    },
    {
      flag: "scores-per-trace",
      type: "number",
      default: 2,
      description: "scores per trace",
    },
    {
      flag: "rich-payloads",
      type: "boolean",
      default: false,
      description: "embed bundled markdown/JSON fixtures as payloads",
    },
  ],
  run,
};
