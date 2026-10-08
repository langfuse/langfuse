import { spawn } from "node:child_process";
import type { TopicClusteringSettings } from "@langfuse/native";
import { z } from "zod";

const numericResultSchema = z.object({
  status: z.enum(["complete", "insufficient_data", "no_topics"]),
  labels: z.array(z.number().int().min(-1)),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});
type NumericResult = z.infer<typeof numericResultSchema>;

export const TOPICS_NUMERIC_VERSION = "3-holomap-0.3.0-hdbscan-rs-0.6.1";

export const topicClusterSettings = (
  exploratory: boolean,
  minimumCount = exploratory ? 10 : 100,
): TopicClusteringSettings => ({
  minimumCount,
  minClusterSize: exploratory ? 3 : 15,
  minSamples: exploratory ? 2 : 5,
});

// Only this small bootstrap runs in the child. The addon ships with the worker;
// no source-file path, development loader, or inherited credentials are needed.
const numericChildProgram = `
const { clusterTopicEmbeddings } = require(process.argv[1]);
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const { embeddings, ...settings } = JSON.parse(input);
    input = "";
    process.stdout.write(JSON.stringify(clusterTopicEmbeddings(embeddings, settings)));
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message : "Numerical fit failed");
    process.exitCode = 1;
  }
});
`;

export async function runTopicClustering(
  embeddings: number[][],
  settings: TopicClusteringSettings,
): Promise<NumericResult> {
  const payload = JSON.stringify({ embeddings, ...settings });
  return await new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["-e", numericChildProgram, require.resolve("@langfuse/native")],
      {
        env: { NODE_ENV: "production" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    let errorOutput = "";
    // Each member produces one label and two finite JSON numbers. Allow ample
    // per-member space without imposing a second, implicit cohort-size limit.
    const maximumOutputLength = 4096 + embeddings.length * 256;
    let outputExceeded = false;
    const timeout = setTimeout(() => {
      reject(new Error("Topics numerical fit exceeded 120 seconds"));
      child.kill("SIGKILL");
    }, 120_000);
    child.stdout.on("data", (data: Buffer) => {
      if (outputExceeded) return;
      output += data.toString();
      if (output.length > maximumOutputLength) {
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      errorOutput = (errorOutput + data.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (outputExceeded) {
        reject(new Error("Topics numerical fit returned oversized output"));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Topics numerical fit failed: ${errorOutput}`));
        return;
      }
      try {
        const result = numericResultSchema.parse(JSON.parse(output));
        if (
          result.status !== "insufficient_data" &&
          (result.labels.length !== embeddings.length ||
            result.coordinates.length !== embeddings.length)
        )
          throw new Error("Numeric result population mismatch");
        resolveResult(result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.on("error", () => {
      /* Process errors are reported by close/error. */
    });
    child.stdin.end(payload);
  });
}
