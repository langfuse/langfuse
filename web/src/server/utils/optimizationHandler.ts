import { type NextApiResponse } from "next";
import { jsonParserPool } from "@/src/server/utils/json/WorkerPool";
import { streamResponse } from "@/src/server/utils/streaming";
import { type JSON_OPTIMIZATION_STRATEGIES } from "@langfuse/shared";

interface OptimizedData {
  metadata?: any;
  input?: any;
  output?: any;
  [key: string]: any;
}

/**
 * Handles optimization strategies for API responses
 * Returns the optimized data or sends streaming response
 */
export async function handleOptimization<T extends OptimizedData>(
  data: T,
  optimization: (typeof JSON_OPTIMIZATION_STRATEGIES)[number] | undefined,
  res: NextApiResponse,
): Promise<T | Record<string, never>> {
  if (!optimization || optimization === "original") {
    return data;
  }

  if (optimization === "streamingWorker") {
    // Process with workers first, then stream the result
    const { results, metrics } = await jsonParserPool.runParallelParse([
      data.metadata as unknown as string,
      data.input as unknown as string,
      data.output as unknown as string,
    ]);

    const [metadata, input, output] = results;

    streamResponse(res, {
      ...data,
      metadata,
      input,
      output,
      optimization: "streamingWorker",
      metrics,
    });
    return {} as any; // Middleware will skip as we did send headers already
  }

  if (optimization === "worker") {
    const { results, metrics } = await jsonParserPool.runParallelParse([
      data.metadata as unknown as string,
      data.input as unknown as string,
      data.output as unknown as string,
    ]);

    const [metadata, input, output] = results;

    return {
      ...data,
      metadata,
      input,
      output,
      optimization: "worker",
      metrics,
    } as T;
  }

  if (optimization === "streaming") {
    streamResponse(res, {
      ...data,
      optimization: "streaming",
    });
    return {} as any; // Middleware will skip as we did send headers already
  }

  return {
    ...data,
    optimization,
  } as T;
}
