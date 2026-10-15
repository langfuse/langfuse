import { clickhouseClient } from "../../../src/server";
import { utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError, SeedSummary } from "./types";
import { countRows } from "./verify";

const BATCH_SIZE = 100_000;
const DEFAULT_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

export const topicsSummariesScenario: ScenarioDefinition = {
  name: "topics-summaries",
  description:
    "Metadata-only Topics query benchmark in a dedicated existing project. Four mixed-state facets and one all-not-applicable facet; no traces, model calls, or embeddings.",
  supportsV4: false,
  flags: [
    {
      flag: "count",
      type: "number",
      default: 100_000,
      description: "total summary rows (up to 10 million)",
    },
    {
      flag: "days",
      type: "number",
      default: 180,
      description: "spread source timestamps over the past N days",
    },
    {
      flag: "complete-percent",
      type: "number",
      default: 90,
      description:
        "complete percentage in the four mixed facets; 0 makes the entire project a negative existence case",
    },
  ],
  async run(ctx, params): Promise<SeedSummary> {
    const startedAt = Date.now();
    const count = Number(params.count);
    const days = Number(params.days);
    const completePercent = Number(params["complete-percent"]);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 10_000_000 ||
      !Number.isInteger(days) ||
      days < 1 ||
      !Number.isInteger(completePercent) ||
      completePercent < 0 ||
      completePercent > 100
    ) {
      throw new SeedError(
        "Expected --count 1..10000000, positive integer --days, and integer --complete-percent 0..100",
      );
    }
    if (ctx.projectId === DEFAULT_PROJECT_ID) {
      throw new SeedError(
        "Topics benchmarks must use a dedicated project, not the default llm-app project",
        "create a separate local project and pass its id with --project",
      );
    }
    const facetIds = Array.from(
      { length: 5 },
      (_, i) => `${ctx.idPrefix}-facet-${i}`,
    );
    const summary = {
      scenario: "topics-summaries",
      target: "clickhouse" as const,
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [],
      sessionIds: [],
      counts: { topicFacetSummaries: count },
      links: [`${ctx.baseUrl}/project/${ctx.projectId}/topics`],
      dryRun: ctx.dryRun,
    };
    if (ctx.dryRun) {
      return { ...summary, verified: {}, durationMs: Date.now() - startedAt };
    }

    const client = clickhouseClient();
    const queryParams = {
      projectId: ctx.projectId,
      prefix: ctx.idPrefix,
      environment: ctx.environment,
      anchor: utcDayStartMs(),
      windowMs: days * 86_400_000,
      seed: ctx.seed,
      completePercent,
    };
    // Generate rows inside ClickHouse to bound application memory. Hashes are
    // stateless so payload changes cannot change a row's ORDER BY tuple.
    // Empty embeddings deliberately benchmark metadata reads, not vector IO.
    for (let offset = 0; offset < count; offset += BATCH_SIZE) {
      await client.command({
        query: `
          INSERT INTO topic_facet_summaries (
            project_id, facet_id, facet_version, trace_id, environment,
            unit_start_time, processing_state, summary, embedding,
            summary_model, embedding_model, provided_usage_details,
            usage_details, provided_cost_details, cost_details, processed_at, metadata
          )
          SELECT
            {projectId: String}, concat({prefix: String}, '-facet-', toString(number % 5)),
            1, concat({prefix: String}, '-trace-', toString(number)), {environment: String},
            fromUnixTimestamp64Milli({anchor: Int64} - toInt64(cityHash64(number, {seed: UInt64}) % {windowMs: UInt64})),
            if(number % 5 != 4 AND cityHash64(number, {seed: UInt64}, 'state') % 100 < {completePercent: UInt8}, 'complete', 'not_applicable'),
            concat('Synthetic benchmark request ', toString(cityHash64(number, {seed: UInt64}, 'summary'))),
            [], 'benchmark-summary', 'benchmark-embedding', map(), map(), map(), map(),
            fromUnixTimestamp64Milli({anchor: Int64}), '{}'
          FROM numbers({offset: UInt64}, {batchCount: UInt64})
        `,
        query_params: {
          ...queryParams,
          offset,
          batchCount: Math.min(BATCH_SIZE, count - offset),
        },
        clickhouse_settings: { wait_end_of_query: 1 },
      });
      ctx.log(
        `inserted ${Math.min(offset + BATCH_SIZE, count)} / ${count} rows`,
      );
    }
    const found = await countRows(
      "topic_facet_summaries FINAL",
      "project_id = {projectId: String} AND facet_id IN {facetIds: Array(String)}",
      { projectId: ctx.projectId, facetIds },
    );
    if (found !== count) {
      throw new SeedError(
        `Readback mismatch: expected ${count} summary rows, found ${found}`,
        "use a fresh --id-prefix when changing count or the timestamp window",
      );
    }
    return {
      ...summary,
      verified: { topicFacetSummaries: found },
      durationMs: Date.now() - startedAt,
    };
  },
};
