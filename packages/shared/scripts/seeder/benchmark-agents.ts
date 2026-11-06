import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { env } from "../../src/env";
import { contextWithLangfuseProps } from "../../src/server/headerPropagation";
import { clickhouseClient } from "../../src/server/clickhouse/client";
import {
  listAgents,
  getAgentDetail,
  getAgentRuns,
  getAgentTraces,
  getAgentSkills,
  getAgentInfo,
  getAgentEnvironments,
} from "../../src/server/repositories/agents";

async function main() {
  const { values } = parseArgs({
    options: {
      project: {
        type: "string",
        default: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      },
      from: { type: "string" },
      to: { type: "string" },
      environment: { type: "string" },
      output: { type: "string" },
      iterations: { type: "string", default: "3" },
    },
  });
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.CLICKHOUSE_URL).hostname,
    )
  )
    throw new Error("This benchmark accepts only the local ClickHouse stack.");
  if (!values.from || !values.to)
    throw new Error("Pass explicit --from and --to UTC timestamps.");
  const iterations = Number(values.iterations);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10)
    throw new Error("iterations must be 1–10");
  const scope = {
    projectId: values.project,
    from: new Date(values.from),
    to: new Date(values.to),
    environment: values.environment ?? null,
  };
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  const startedAt = new Date();
  const measurements: { name: string; durationMs: number }[] = [];
  let agentCount = 0;
  await context.with(
    contextWithLangfuseProps({
      projectId: scope.projectId,
      clickhouse: { surface: "internalapi", route: "agents.benchmark" },
    }),
    async () => {
      const timed = async <T>(name: string, read: () => Promise<T>) => {
        const started = performance.now();
        const result = await read();
        measurements.push({
          name,
          durationMs: Math.round((performance.now() - started) * 100) / 100,
        });
        return result;
      };
      for (let i = 0; i < iterations; i++) {
        const gallery = await timed("gallery", () =>
          listAgents({
            ...scope,
            page: 0,
            pageSize: 24,
            sort: "runs",
            direction: "desc",
          }),
        );
        agentCount = gallery.totalCount;
        if (!gallery.items[0])
          throw new Error("Seed agents-mvp in the selected period first.");
        const detail = { ...scope, identity: gallery.items[0].identity };
        await timed("detail", () => getAgentDetail(detail));
        await timed("runs", () =>
          getAgentRuns({ ...detail, page: 0, pageSize: 50 }),
        );
        await timed("traces", () =>
          getAgentTraces({ ...detail, page: 0, pageSize: 50 }),
        );
        await timed("skills", () =>
          getAgentSkills({ ...detail, page: 0, pageSize: 50 }),
        );
        await timed("info", () => getAgentInfo(detail));
        await timed("environments", () => getAgentEnvironments(scope));
      }
    },
  );
  // Query-log writes are asynchronous. This read-only wait does not flush or mutate the database.
  await new Promise((resolve) => setTimeout(resolve, 11_000));
  const logs = await clickhouseClient().query({
    query: `SELECT query_id, query_duration_ms, read_rows, read_bytes, memory_usage,
      ProfileEvents['SelectedMarks'] AS selected_marks, query
    FROM system.query_log WHERE type = 'QueryFinish'
      AND query_start_time_microseconds >= {started: DateTime64(3, 'UTC')}
      AND JSONExtractString(log_comment, 'route') = 'agents.benchmark'
      AND JSONExtractString(log_comment, 'projectId') = {projectId: String}
    ORDER BY query_start_time_microseconds`,
    query_params: {
      started: startedAt.toISOString().replace("T", " ").replace("Z", ""),
      projectId: scope.projectId,
    },
    format: "JSONEachRow",
  });
  const queryLog = await logs.json<{
    query_id: string;
    query_duration_ms: number;
    read_rows: string;
    read_bytes: string;
    memory_usage: string;
    selected_marks: string;
    query: string;
  }>();
  const gallerySql = queryLog.find(
    (row) =>
      row.query.includes("GROUP BY identity_kind, identity_value") &&
      row.query.includes("ORDER BY runs DESC"),
  )?.query;
  let indexEvidence: string[] = [];
  if (gallerySql) {
    const explain = await clickhouseClient().query({
      query: `EXPLAIN indexes = 1 ${gallerySql.replace(/\s+FORMAT\s+JSONEachRow\s*;?$/i, "")}`,
      query_params: {
        projectId: scope.projectId,
        agentsFrom: scope.from.toISOString().replace("T", " ").replace("Z", ""),
        agentsTo: scope.to.toISOString().replace("T", " ").replace("Z", ""),
        agentPageSize: 24,
        agentOffset: 0,
        ...(scope.environment === null
          ? {}
          : { agentEnvironment: scope.environment }),
      },
      format: "JSONEachRow",
    });
    indexEvidence = (await explain.json<{ explain: string }>()).map(
      (row) => row.explain,
    );
  }
  const report = {
    repositorySha256: createHash("sha256")
      .update(
        readFileSync(
          resolve(__dirname, "../../src/server/repositories/agents.ts"),
        ),
      )
      .digest("hex"),
    kind: "synthetic-local-measurement",
    measuredAt: startedAt.toISOString(),
    scope: {
      ...scope,
      from: scope.from.toISOString(),
      to: scope.to.toISOString(),
    },
    iterations,
    agentCount,
    measurements,
    queryLog: queryLog.map(({ query: _query, ...row }) => row),
    indexEvidence,
    limits: {
      maxExecutionSeconds: 10,
      maxMemoryBytes: 268435456,
      maxReadBytes: 536870912,
    },
    caveat:
      "Local synthetic data; not a production latency guarantee. Timings include client overhead. Every result covers the full selected cohort without sampling.",
  };
  if (values.output)
    writeFileSync(values.output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      agentCount,
      procedureCalls: measurements.length,
      loggedQueries: queryLog.length,
      maxProcedureMs: Math.max(...measurements.map((row) => row.durationMs)),
      maxQueryMs: Math.max(
        0,
        ...queryLog.map((row) => Number(row.query_duration_ms)),
      ),
      maxReadRows: Math.max(0, ...queryLog.map((row) => Number(row.read_rows))),
      maxReadBytes: Math.max(
        0,
        ...queryLog.map((row) => Number(row.read_bytes)),
      ),
      maxMemoryBytes: Math.max(
        0,
        ...queryLog.map((row) => Number(row.memory_usage)),
      ),
      indexEvidence: indexEvidence.filter((line) =>
        /Parts:|Granules:|PrimaryKey|Partition/.test(line),
      ),
      output: values.output ?? null,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
