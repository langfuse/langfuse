/** @jest-environment node */

import { performance } from "perf_hooks";
import { randomUUID } from "crypto";
import { makeAPICall, getTrpcCaller } from "@/src/__tests__/test-utils";
import waitForExpect from "wait-for-expect";
import {
  getTraceById,
  getObservationById,
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import {
  JSON_OPTIMIZATION_STRATEGIES,
  type JSONOptimizationStrategy,
} from "@langfuse/shared";
import { jsonParserPool } from "@/src/server/utils/json/WorkerPool";
import { reconstructFromChunks } from "@/src/server/utils/trpcStreaming";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

interface PerformanceResult {
  time: number;
  ttfb?: number; // Time to first byte
  responseData?: any; // Store response data for comparison
  metrics?: {
    mainThreadTime: number;
    totalWorkerCpuTime: number;
    avgWorkerCpuTime: number;
    maxWorkerCpuTime: number;
    coordinationOverhead: number;
    activeWorkerCount: number;
    dispatchTime: number;
    actualIdleTime: number;
    resultProcessingTime: number;
  };
}

interface PerformanceTestConfig {
  entityType: "Trace" | "Observation";
  insertApi: (size: number) => Promise<{
    id: string;
    traceId?: string;
    time: number;
    payloadSizeInMB: number;
  }>;
  insertDirect: (size: number) => Promise<{
    id: string;
    traceId?: string;
    time: number;
    payloadSizeInMB: number;
  }>;
  retrieveGet: (
    id: string,
    optimization: JSONOptimizationStrategy,
  ) => Promise<PerformanceResult>;
  retrieveTrpc: (
    id: string,
    traceId: string | undefined,
    optimization: JSONOptimizationStrategy,
  ) => Promise<PerformanceResult>;
}

function makeTrpcCaller() {
  const caller = getTrpcCaller(projectId);
  return caller;
}
function generateLargeJsonPayload(size: number): any {
  return {
    largeMetadata: Array.from({ length: size }, (_, i) => ({
      id: i,
      value: `value-${i}-${Math.random().toString(36).substring(2)}`,
      randomData: Math.random().toString(36).substring(2),
      timestamp: new Date().toISOString(),
      largeField: "x".repeat(100),
    })),
    additionalContext: {
      moreRandomness: Math.random().toString(36).substring(2),
      largeString: "z".repeat(1000),
    },
  };
}

async function waitForEntityInDatabase<T>(
  getEntity: () => Promise<T | null>,
  expectedId: string,
): Promise<void> {
  await waitForExpect(async () => {
    const entity = await getEntity();
    expect(entity).toBeDefined();
    expect((entity as any)!.id).toBe(expectedId);
    expect((entity as any)!.projectId).toBe(projectId);
  });
}
async function insertTrace(length: number, traceId = randomUUID()) {
  const largeJsonData = generateLargeJsonPayload(length);

  const entity = {
    id: randomUUID(),
    type: "trace-create" as const,
    timestamp: new Date().toISOString(),
    body: {
      id: traceId,
      timestamp: new Date().toISOString(),
      metadata: largeJsonData,
      input: largeJsonData,
      output: largeJsonData,
    },
  };

  const payloadSizeInMB =
    Buffer.from(JSON.stringify(entity)).length / (1024 * 1024);

  const startTime = performance.now();
  const response = await makeAPICall("POST", "/api/public/ingestion", {
    batch: [entity],
  });
  const endTime = performance.now();

  expect(response.status).toBe(207);

  await waitForEntityInDatabase(
    () => getTraceById({ traceId, projectId }),
    traceId,
  );

  return { id: traceId, traceId, time: endTime - startTime, payloadSizeInMB };
}

async function insertObservation(length: number) {
  const observationId = randomUUID();
  const traceId = randomUUID();
  const largeJsonData = generateLargeJsonPayload(length);

  await insertTrace(1, traceId);

  const entity = {
    id: randomUUID(),
    type: "span-create" as const,
    timestamp: new Date().toISOString(),
    body: {
      id: observationId,
      traceId: traceId,
      startTime: new Date().toISOString(),
      metadata: largeJsonData,
      input: largeJsonData,
      output: largeJsonData,
    },
  };

  const payloadSizeInMB =
    Buffer.from(JSON.stringify(entity)).length / (1024 * 1024);

  const startTime = performance.now();
  await makeAPICall("POST", "/api/public/ingestion", {
    batch: [entity],
  });
  const endTime = performance.now();

  await waitForEntityInDatabase(
    () =>
      getObservationById({
        id: observationId,
        projectId,
        fetchWithInputOutput: true,
      }),
    observationId,
  );

  return {
    id: observationId,
    traceId,
    time: endTime - startTime,
    payloadSizeInMB,
  };
}

async function insertTraceDirect(length: number, traceId = randomUUID()) {
  const largeJsonData = generateLargeJsonPayload(length);

  const trace = createTrace({
    id: traceId,
    project_id: projectId,
    metadata: largeJsonData,
    input: largeJsonData,
    output: largeJsonData,
  });

  const payloadSizeInMB =
    Buffer.from(JSON.stringify(trace)).length / (1024 * 1024);

  const startTime = performance.now();
  await createTracesCh([trace]);
  const endTime = performance.now();

  await waitForEntityInDatabase(
    () => getTraceById({ traceId, projectId }),
    traceId,
  );

  return { id: traceId, traceId, time: endTime - startTime, payloadSizeInMB };
}

async function insertObservationDirect(length: number) {
  const observationId = randomUUID();
  const traceId = randomUUID();
  const largeJsonData = generateLargeJsonPayload(length);

  // Create the parent trace first
  await insertTraceDirect(1, traceId);

  const observation = createObservation({
    id: observationId,
    trace_id: traceId,
    project_id: projectId,
    type: "GENERATION",
    name: "test-generation",
    metadata: largeJsonData,
    input: largeJsonData,
    output: largeJsonData,
  });

  const payloadSizeInMB =
    Buffer.from(JSON.stringify(observation)).length / (1024 * 1024);

  const startTime = performance.now();
  await createObservationsCh([observation]);
  const endTime = performance.now();

  await waitForEntityInDatabase(
    () =>
      getObservationById({
        id: observationId,
        projectId,
        fetchWithInputOutput: true,
      }),
    observationId,
  );

  return {
    id: observationId,
    traceId,
    time: endTime - startTime,
    payloadSizeInMB,
  };
}

// Helper function to measure TTFB (Time To First Byte) more accurately
async function makeAPICallWithTTFB<T = any>(
  method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH",
  url: string,
  body?: unknown,
  auth?: string,
): Promise<{ body: T; status: number; ttfb: number; totalTime: number }> {
  const finalUrl = `http://localhost:3000${url.startsWith("/") ? url : `/${url}`}`;
  const authorization =
    auth ||
    "Basic " +
      Buffer.from("pk-lf-1234567890:sk-lf-1234567890").toString("base64");

  const options = {
    method: method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: authorization,
    },
    ...(method !== "GET" &&
      body !== undefined && { body: JSON.stringify(body) }),
  };

  const startTime = performance.now();

  const response = await fetch(finalUrl, options);
  const ttfb = performance.now() - startTime; // TTFB is when response headers arrive

  const responseBody = (await response.json()) as T;
  const totalTime = performance.now() - startTime;

  return {
    body: responseBody,
    status: response.status,
    ttfb,
    totalTime,
  };
}

// Helper functions for retrieval
async function retrieveTraceGET(
  traceId: string,
  optimization: JSONOptimizationStrategy,
): Promise<PerformanceResult> {
  const result = await makeAPICallWithTTFB(
    "GET",
    `/api/public/traces/${traceId}?optimization=${optimization}`,
  );
  const body = result.body as any;

  if (optimization !== "original") {
    expect(body.optimization).toBe(optimization);
  }

  const { cleanData, metrics } = cleanResponseData(body);

  return {
    time: result.totalTime,
    ttfb: result.ttfb,
    responseData: cleanData,
    metrics,
  };
}

async function retrieveObservationGET(
  observationId: string,
  optimization: JSONOptimizationStrategy,
): Promise<PerformanceResult> {
  const result = await makeAPICallWithTTFB(
    "GET",
    `/api/public/observations/${observationId}?optimization=${optimization}`,
  );
  const body = result.body as any;

  if (optimization !== "original") {
    expect(body.optimization).toBe(optimization);
  }

  const { cleanData, metrics } = cleanResponseData(body);

  return {
    time: result.totalTime,
    ttfb: result.ttfb,
    responseData: cleanData,
    metrics,
  };
}

// Generic helper for TRPC calls with optional streaming
async function performTRPCCall(
  regularCall: () => Promise<any>,
  streamingCall: () => Promise<AsyncIterable<string>>,
  optimization: JSONOptimizationStrategy,
): Promise<{ result: any; ttfb?: number }> {
  if (optimization === "streaming") {
    const chunks: string[] = [];
    const iterable = await streamingCall();

    let ttfb: number | undefined;
    let isFirstChunk = true;
    const streamStartTime = performance.now();

    for await (const chunk of iterable) {
      if (isFirstChunk) {
        ttfb = performance.now() - streamStartTime;
        isFirstChunk = false;
      }
      chunks.push(chunk);
    }

    const result = reconstructFromChunks(chunks);
    return { result, ttfb };
  } else {
    const result = await regularCall();
    return { result };
  }
}

// Helper function to clean response data for comparison
function cleanResponseData(result: any): { cleanData: any; metrics?: any } {
  const metrics = result.metrics;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { optimization: _opt, metrics: _metrics, ...cleanData } = result;
  return { cleanData, metrics };
}

async function retrieveTraceTRPC(
  traceId: string,
  optimization: JSONOptimizationStrategy,
): Promise<PerformanceResult> {
  const caller = makeTrpcCaller();
  const startTime = performance.now();

  const { result, ttfb } = await performTRPCCall(
    () => caller.traces.byId({ traceId, projectId, optimization }),
    () => caller.traces.streamById({ traceId, projectId, optimization }),
    optimization,
  );

  const endTime = performance.now();

  if (optimization !== "original") {
    expect(result.optimization).toBe(optimization);
  }

  const { cleanData, metrics } = cleanResponseData(result);

  return {
    time: endTime - startTime,
    ttfb,
    responseData: cleanData,
    metrics,
  };
}

async function retrieveObservationTRPC(
  observationId: string,
  traceId: string,
  optimization: JSONOptimizationStrategy,
): Promise<PerformanceResult> {
  const caller = makeTrpcCaller();
  const startTime = performance.now();

  const { result, ttfb } = await performTRPCCall(
    () =>
      caller.observations.byId({
        observationId,
        traceId,
        projectId,
        optimization,
      }),
    () =>
      caller.observations.streamById({
        observationId,
        traceId,
        projectId,
        optimization,
      }),
    optimization,
  );

  const endTime = performance.now();

  if (optimization !== "original") {
    expect(result.optimization).toBe(optimization);
  }

  const { cleanData, metrics } = cleanResponseData(result);

  return {
    time: endTime - startTime,
    ttfb,
    responseData: cleanData,
    metrics,
  };
}

function formatMetricsLog(
  baseLog: string,
  optimization: JSONOptimizationStrategy,
  result: PerformanceResult | undefined,
): string {
  let logWithTTFB = baseLog;
  if (result?.ttfb !== undefined) {
    logWithTTFB = `${baseLog} (TTFB: ${result.ttfb.toFixed(2)}ms)`;
  }

  if ((optimization === "worker" || optimization === "streamingWorker") && result?.metrics) {
    const {
      mainThreadTime,
      totalWorkerCpuTime,
      avgWorkerCpuTime,
      maxWorkerCpuTime,
      coordinationOverhead,
      activeWorkerCount,
      dispatchTime,
      actualIdleTime,
      resultProcessingTime,
    } = result.metrics;
    return `${logWithTTFB} (main: ${mainThreadTime.toFixed(
      2,
    )}ms, total: ${totalWorkerCpuTime.toFixed(
      2,
    )}ms, avg: ${avgWorkerCpuTime.toFixed(
      2,
    )}ms, max: ${maxWorkerCpuTime.toFixed(
      2,
    )}ms, dispatch: ${dispatchTime.toFixed(
      2,
    )}ms, idle: ${actualIdleTime.toFixed(
      2,
    )}ms, processing: ${resultProcessingTime.toFixed(
      2,
    )}ms, overhead: ${coordinationOverhead.toFixed(2)}ms, workers: ${activeWorkerCount})`;
  }
  return logWithTTFB;
}

// Helper function to validate that all optimizations return the same data
function validateResponseEquality(
  results: Partial<Record<JSONOptimizationStrategy, PerformanceResult>>,
  entityType: string,
): string[] {
  const validationMessages: string[] = [];
  const strategies = Object.keys(results) as JSONOptimizationStrategy[];
  if (strategies.length < 2) return validationMessages;

  // Use the first strategy as baseline (usually "original")
  const baseline = strategies[0];
  const baselineData = results[baseline]?.responseData;

  if (!baselineData) return validationMessages;

  // Compare all other strategies against baseline
  for (let i = 1; i < strategies.length; i++) {
    const strategy = strategies[i];
    const strategyData = results[strategy]?.responseData;

    if (!strategyData) continue;

    if (strategy === "raw") {
      // raw is raw dumping so just flag the comparison without expecting it to match
      const isEqual =
        JSON.stringify(strategyData) === JSON.stringify(baselineData);
      validationMessages.push(
        `${isEqual ? "✓" : "✗"} ${entityType} ${strategy} response ${isEqual ? "matches" : "differs from"} ${baseline} (raw format, expected to differ)`,
      );
      continue;
    }

    try {
      expect(strategyData).toEqual(baselineData);
      validationMessages.push(
        `✓ ${entityType} ${strategy} response matches ${baseline}`,
      );
    } catch (error) {
      validationMessages.push(
        `✗ ${entityType} ${strategy} response differs from ${baseline}`,
      );
      console.error(`${entityType} ${strategy} validation failed:`);
      console.error("Baseline keys:", Object.keys(baselineData).sort());
      console.error("Strategy keys:", Object.keys(strategyData).sort());

      // Find specific differences
      const baselineKeys = new Set(Object.keys(baselineData));
      const strategyKeys = new Set(Object.keys(strategyData));

      const missingKeys = [...baselineKeys].filter((k) => !strategyKeys.has(k));
      const extraKeys = [...strategyKeys].filter((k) => !baselineKeys.has(k));

      if (missingKeys.length > 0) {
        console.error("Missing keys in strategy:", missingKeys);
      }
      if (extraKeys.length > 0) {
        console.error("Extra keys in strategy:", extraKeys);
      }

      // For TRPC validation failures, don't throw the error, just log it
      if (entityType.includes("TRPC")) {
        console.error(
          "TRPC validation error (continuing):",
          (error as Error).message,
        );
      } else {
        throw error;
      }
    }
  }

  return validationMessages;
}

async function runPerformanceTest(
  size: number,
  name: string,
  config: PerformanceTestConfig,
) {
  let ids: { id: string; traceId?: string };
  let payloadSizeInMB: number;
  let apiTime: number | null = null;
  let directTime: number;

  if (size <= 6700) {
    const apiRes = await config.insertApi(size);
    ids = { id: apiRes.id, traceId: apiRes.traceId };
    payloadSizeInMB = apiRes.payloadSizeInMB;
    apiTime = apiRes.time;
    const directRes = await config.insertDirect(size);
    directTime = directRes.time;
  } else {
    const directRes = await config.insertDirect(size);
    ids = { id: directRes.id, traceId: directRes.traceId };
    payloadSizeInMB = directRes.payloadSizeInMB;
    directTime = directRes.time;
  }

  // Warm-up
  await config.retrieveGet(ids.id, "original");
  await config.retrieveTrpc(ids.id, ids.traceId, "original");

  // Timed Retrieval
  const getResults: Partial<
    Record<JSONOptimizationStrategy, PerformanceResult>
  > = {};
  // for (const opt of ["raw" as const]) {
  for (const opt of JSON_OPTIMIZATION_STRATEGIES) {
    getResults[opt] = await config.retrieveGet(ids.id, opt);
  }

  const trpcResults: Partial<
    Record<JSONOptimizationStrategy, PerformanceResult>
  > = {};
  // Include streaming for TRPC using the streaming subscription endpoint
  for (const opt of JSON_OPTIMIZATION_STRATEGIES.filter(
    (s) => s != "streamingWorker",
  )) {
    trpcResults[opt] = await config.retrieveTrpc(ids.id, ids.traceId, opt);
  }

  const apiTimeLog = apiTime
    ? `API insertion: ${apiTime.toFixed(2)}ms`
    : "API insertion: skipped (payload too large)";

  const getLogs = JSON_OPTIMIZATION_STRATEGIES.map((opt) => {
    const result = getResults[opt];
    const baseLog = `  GET ${opt.padEnd(8)}: ${(result?.time ?? 0).toFixed(2)}ms`;
    return formatMetricsLog(baseLog, opt, result);
  }).join("\n");

  const trpcLogs = JSON_OPTIMIZATION_STRATEGIES.map((opt) => {
    const result = trpcResults[opt];
    const baseLog = `  TRPC ${opt.padEnd(8)}: ${(result?.time ?? 0).toFixed(2)}ms`;
    return formatMetricsLog(baseLog, opt, result);
  }).join("\n");

  // Validate that all GET and TRPC responses are identical (except optimization field)
  const getValidationMessages = validateResponseEquality(
    getResults,
    `${config.entityType} GET`,
  );
  const trpcValidationMessages = validateResponseEquality(
    trpcResults,
    `${config.entityType} TRPC`,
  );
  const validationLog =
    [...getValidationMessages, ...trpcValidationMessages].length > 0
      ? `Response Validation:\n${[...getValidationMessages, ...trpcValidationMessages].map((msg) => `  ${msg}`).join("\n")}\n`
      : "";

  console.log(
    `--- ${config.entityType} (${name}, size: ${size}, ~${payloadSizeInMB.toFixed(
      2,
    )} MB) ---\n` +
      `${apiTimeLog}\n` +
      `Direct insertion: ${directTime.toFixed(2)}ms\n` +
      `${validationLog}` +
      `Retrievals (GET):\n` +
      `${getLogs}\n` +
      `Retrievals (TRPC):\n` +
      `${trpcLogs}`,
  );
}

async function runTracePerformanceTest(size: number, name: string) {
  await runPerformanceTest(size, name, {
    entityType: "Trace",
    insertApi: insertTrace,
    insertDirect: insertTraceDirect,
    retrieveGet: retrieveTraceGET,
    retrieveTrpc: (id, _, opt) => retrieveTraceTRPC(id, opt),
  });
}

async function runObservationPerformanceTest(size: number, name: string) {
  await runPerformanceTest(size, name, {
    entityType: "Observation",
    insertApi: insertObservation,
    insertDirect: insertObservationDirect,
    retrieveGet: retrieveObservationGET,
    retrieveTrpc: (id, traceId, opt) =>
      retrieveObservationTRPC(id, traceId!, opt),
  });
}

// Note: it.each is not used to allow easier simple clicks to run single tests in the IDE
describe("JSON Performance Tests", () => {
  // Warm-up phase to mitigate cold start issues
  beforeAll(async () => {
    jsonParserPool.start();
    console.log("Running warm-up phase...");
    const { traceId } = await insertTrace(1);
    await retrieveTraceGET(traceId, "original");
    const { id: observationId, traceId: obsTraceId } =
      await insertObservation(1);
    await retrieveObservationTRPC(observationId, obsTraceId, "original");
    console.log("Warm-up complete.");
  }, 20000); // 20s timeout for warm-up

  afterAll(async () => {
    await jsonParserPool.shutdown();
  });

  it("should measure performance for a s trace", async () => {
    await runTracePerformanceTest(100, "s");
  });

  it("should measure performance for a m trace", async () => {
    await runTracePerformanceTest(1000, "m");
  });

  it("should measure performance for a l trace", async () => {
    await runTracePerformanceTest(6700, "l");
  });

  it("should measure performance for a xl trace", async () => {
    await runTracePerformanceTest(10000, "xl");
  });

  it("should measure performance for a xxl trace", async () => {
    await runTracePerformanceTest(40000, "xxl");
  }, 20000);

  it("should measure performance for a s observation", async () => {
    await runObservationPerformanceTest(100, "s");
  });

  it("should measure performance for a m observation", async () => {
    await runObservationPerformanceTest(1000, "m");
  });

  it("should measure performance for a l observation", async () => {
    await runObservationPerformanceTest(6700, "l");
  });

  it("should measure performance for a xl observation", async () => {
    await runObservationPerformanceTest(10000, "xl");
  });

  it("should measure performance for a xxl observation", async () => {
    await runObservationPerformanceTest(40000, "xxl");
  }, 20000);
});
