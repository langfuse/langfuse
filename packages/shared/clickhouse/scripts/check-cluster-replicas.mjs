// Checks that every replica of CLICKHOUSE_CLUSTER_NAME answers before
// clustered migrations run. An ON CLUSTER statement waits for all replicas; with
// one unreachable it fails after distributed_ddl_task_timeout and golang-migrate
// marks the version dirty, which blocks every later run until an operator
// forces the version. Failing here leaves the version untouched, so the next
// start retries once the replica is back.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUEST_TIMEOUT_MS = 30_000;

function quoteClickhouseString(value) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function buildReplicaCheckQuery(clusterName) {
  return `SELECT hostName() AS host FROM clusterAllReplicas(${quoteClickhouseString(clusterName)}, system.one) FORMAT JSONEachRow`;
}

async function checkClusterReplicas({ url, user, password, clusterName }) {
  // Buffer the result so an unreachable replica fails the request instead of
  // arriving after rows that were already streamed with a 200 status.
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("wait_end_of_query", "1");
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
    },
    body: buildReplicaCheckQuery(clusterName),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  if (!response.ok) {
    // The exception lists each unreachable host on its own line.
    throw new Error(body.replace(/\s+/g, " ").trim().slice(0, 1000));
  }
  return body
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).host);
}

// Reads the runtime environment as a whole, like src/env.ts. The script runs
// at container start, never inside a cached turbo task.
async function main(env = process.env) {
  const clusterName = env.CLICKHOUSE_CLUSTER_NAME || "default";
  try {
    const hosts = await checkClusterReplicas({
      url: env.CLICKHOUSE_URL,
      user: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      clusterName,
    });
    console.log(
      `All ${hosts.length} replicas of ClickHouse cluster ${clusterName} are reachable: ${hosts.join(", ")}`,
    );
  } catch (error) {
    console.error(
      `Error: not every replica of ClickHouse cluster ${clusterName} is reachable, so pending migrations were not applied.`,
    );
    console.error(
      `Applying them now would time out and mark the migration version dirty. Retry once all replicas are up.`,
    );
    console.error(
      `ClickHouse: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
