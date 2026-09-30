// Experiment: cluster the current Issues summaries with the worker's own clustering.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  runTopicClustering,
  topicClusterSettings,
} from "../features/topics/numeric";

const out = process.argv[2];
const facetId = process.argv[3] ?? "cmuglfns40005z6tofggifkje";
const rows = execFileSync(
  "docker",
  [
    "exec",
    "langfuse-clickhouse",
    "clickhouse-client",
    "-q",
    `SELECT trace_id, summary, embedding FROM topic_facet_summaries WHERE project_id='7a88fb47-b4e2-43b8-a06c-a5ce950dc53a' AND facet_id='${facetId}' AND processing_state='complete' ORDER BY processed_at DESC LIMIT 1 BY trace_id FORMAT JSONEachRow`,
  ],
  { maxBuffer: 1 << 28 },
)
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(
    (l) =>
      JSON.parse(l) as {
        trace_id: string;
        summary: string;
        embedding: number[];
      },
  );

async function main() {
  const result = await runTopicClustering(
    rows.map((r) => r.embedding),
    topicClusterSettings(true),
  );
  const clusters: Record<string, string[]> = {};
  rows.forEach((r, i) => (clusters[result.labels[i]] ??= []).push(r.summary));
  writeFileSync(
    out,
    JSON.stringify(
      {
        status: result.status,
        members: rows.map((r, i) => ({
          traceId: r.trace_id,
          summary: r.summary,
          cluster: result.labels[i],
        })),
      },
      null,
      1,
    ),
  );
  const sizes = Object.entries(clusters)
    .map(([k, v]) => [k, v.length] as const)
    .sort((a, b) => b[1] - a[1]);
  console.log(
    `status ${result.status} | summaries ${rows.length} | clusters ${sizes.filter(([k]) => k !== "-1").length} | outliers ${clusters["-1"]?.length ?? 0} | sizes ${sizes.map(([k, n]) => `${k}:${n}`).join(" ")}`,
  );
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
