import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "../../env";

const numericResultSchema = z.object({
  status: z.enum(["complete", "insufficient_data", "no_topics"]),
  labels: z.array(z.number().int()),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});
export type NumericResult = z.infer<typeof numericResultSchema>;

export const topicClusterSettings = (exploratory: boolean) => ({
  minimumCount: exploratory ? 10 : 100,
  minClusterSize: exploratory ? 3 : 15,
  minSamples: exploratory ? 2 : 5,
  seed: 42,
  allowSingleCluster: false,
  neighborRule: "min(15,max(3,floor(n/3)))",
  numericVersion: "2",
});

export async function runTopicClustering(
  embeddings: number[][],
  exploratory: boolean,
): Promise<NumericResult> {
  const settings = topicClusterSettings(exploratory);
  if (embeddings.length < settings.minimumCount)
    return { status: "insufficient_data", labels: [], coordinates: [] };
  if (embeddings.length > 1000)
    throw new Error("Topics local fit is limited to 1000 summaries");
  const python =
    env.LANGFUSE_TOPICS_PYTHON_PATH ??
    resolve(__dirname, "../../../.topics-venv/bin/python");
  return await new Promise((resolveResult, reject) => {
    const child = spawn(
      python,
      [resolve(__dirname, "../../../src/features/topics/numeric/cluster.py")],
      {
        env: {
          NODE_ENV: "development",
          PATH: "/usr/bin:/bin",
          PYTHONNOUSERSITE: "1",
          NUMBA_NUM_THREADS: "1",
          OMP_NUM_THREADS: "1",
          OPENBLAS_NUM_THREADS: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    let errorOutput = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Topics numerical fit exceeded 120 seconds"));
    }, 120_000);
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.length > 2_000_000) child.kill("SIGKILL");
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
    child.stdin.end(JSON.stringify({ embeddings, ...settings }));
  });
}
