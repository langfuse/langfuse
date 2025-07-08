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

/** Number of times to run each test */
const PERFORMANCE_ITERATIONS = 5;
/** Whether to randomize the order of tests */
const ENABLE_RANDOM_ORDER = true;

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Calculate average and standard deviation for a set of numbers
 */
function calculateStats(values: number[]): { average: number; stdDev: number } {
  if (values.length === 0) return { average: 0, stdDev: 0 };
  if (values.length === 1) return { average: values[0], stdDev: 0 };

  const average = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  return { average, stdDev };
}

/**
 * Average worker metrics and calculate standard deviations
 */
function averageWorkerMetrics(metricsArray: WorkerMetrics[]): {
  averaged: WorkerMetrics;
  stdDev?: WorkerMetrics;
} {
  if (metricsArray.length === 0) {
    throw new Error("Cannot average empty metrics array");
  }

  const metricKeys = Object.keys(metricsArray[0]) as (keyof WorkerMetrics)[];
  const averaged = {} as WorkerMetrics;
  const stdDev = {} as WorkerMetrics;

  for (const key of metricKeys) {
    const values = metricsArray.map((m) => m[key]);
    const stats = calculateStats(values);
    averaged[key] =
      key === "activeWorkerCount" ? Math.round(stats.average) : stats.average;
    stdDev[key] = stats.stdDev;
  }

  return {
    averaged,
    stdDev: metricsArray.length > 1 ? stdDev : undefined,
  };
}

/**
 * Average multiple performance results and calculate standard deviation
 */
function averagePerformanceResults(
  results: PerformanceResult[],
): PerformanceResult {
  if (results.length === 0) {
    throw new Error("Cannot average empty results array");
  }

  if (results.length === 1) {
    return {
      ...results[0],
      timeStdDev: 0,
      ttfbStdDev: 0,
      metricsStdDev: undefined,
    };
  }

  // Calculate stats for time and TTFB
  const timeStats = calculateStats(results.map((r) => r.time));
  const ttfbValues = results
    .filter((r) => r.ttfb !== undefined)
    .map((r) => r.ttfb!);
  const ttfbStats = calculateStats(ttfbValues);

  // Average worker metrics if they exist
  let averagedMetrics: WorkerMetrics | undefined;
  let metricsStdDev: WorkerMetrics | undefined;
  const metricsResults = results.filter((r) => r.metrics);

  if (metricsResults.length > 0) {
    const { averaged, stdDev } = averageWorkerMetrics(
      metricsResults.map((r) => r.metrics!),
    );
    averagedMetrics = averaged;
    metricsStdDev = stdDev;
  }

  return {
    time: timeStats.average,
    ttfb: ttfbStats.average,
    timeStdDev: timeStats.stdDev,
    ttfbStdDev: ttfbStats.stdDev,
    responseData: results[0].responseData,
    metrics: averagedMetrics,
    metricsStdDev,
  };
}

interface WorkerMetrics {
  mainThreadTime: number;
  totalWorkerCpuTime: number;
  avgWorkerCpuTime: number;
  maxWorkerCpuTime: number;
  coordinationOverhead: number;
  activeWorkerCount: number;
  dispatchTime: number;
  actualIdleTime: number;
  resultProcessingTime: number;
}

interface PerformanceResult {
  time: number;
  ttfb?: number;
  responseData?: any;
  metrics?: WorkerMetrics;
  // Standard deviation fields for multiple iterations
  timeStdDev?: number;
  ttfbStdDev?: number;
  metricsStdDev?: WorkerMetrics;
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

/**
 * Format a metric value with optional standard deviation
 */
function formatMetric(
  value: number,
  stdDev?: number,
  precision = 2,
  unit = "ms",
): string {
  const formattedValue = value.toFixed(precision);
  if (stdDev && stdDev > 0) {
    return `${formattedValue}${unit} (±${stdDev.toFixed(precision)}${unit})`;
  }
  return `${formattedValue}${unit}`;
}

/**
 * Format worker metrics for logging
 */
function formatWorkerMetrics(
  metrics: WorkerMetrics,
  stdDev?: WorkerMetrics,
): string {
  const parts = [
    `main: ${formatMetric(metrics.mainThreadTime, stdDev?.mainThreadTime)}`,
    `total: ${formatMetric(metrics.totalWorkerCpuTime, stdDev?.totalWorkerCpuTime)}`,
    `avg: ${formatMetric(metrics.avgWorkerCpuTime, stdDev?.avgWorkerCpuTime)}`,
    `max: ${formatMetric(metrics.maxWorkerCpuTime, stdDev?.maxWorkerCpuTime)}`,
    `dispatch: ${formatMetric(metrics.dispatchTime, stdDev?.dispatchTime)}`,
    `idle: ${formatMetric(metrics.actualIdleTime, stdDev?.actualIdleTime)}`,
    `processing: ${formatMetric(metrics.resultProcessingTime, stdDev?.resultProcessingTime)}`,
    `overhead: ${formatMetric(metrics.coordinationOverhead, stdDev?.coordinationOverhead)}`,
    `workers: ${formatMetric(metrics.activeWorkerCount, stdDev?.activeWorkerCount, 1, "")}`,
  ];

  return `(${parts.join(", ")})`;
}

function formatMetricsLog(
  baseLog: string,
  optimization: JSONOptimizationStrategy,
  result: PerformanceResult | undefined,
): string {
  let logWithTTFB = baseLog;

  // Add standard deviation to the base log if available
  if (result?.timeStdDev !== undefined && result.timeStdDev > 0) {
    const baseTime = baseLog.match(/(\d+\.\d+)ms/)?.[1];
    if (baseTime) {
      logWithTTFB = baseLog.replace(
        `${baseTime}ms`,
        formatMetric(parseFloat(baseTime), result.timeStdDev),
      );
    }
  }

  // Add TTFB information
  if (result?.ttfb !== undefined) {
    const ttfbPart = `TTFB: ${formatMetric(result.ttfb, result.ttfbStdDev)}`;
    logWithTTFB = `${logWithTTFB} (${ttfbPart})`;
  }

  // Add worker metrics for worker-based optimizations
  if (
    (optimization === "worker" || optimization === "streamingWorker") &&
    result?.metrics
  ) {
    const workerMetrics = formatWorkerMetrics(
      result.metrics,
      result.metricsStdDev,
    );
    return `${logWithTTFB} ${workerMetrics}`;
  }

  return logWithTTFB;
}

/**
 * Execute performance tests with randomization and averaging
 */
async function executePerformanceTests(
  testFunction: (
    strategy: JSONOptimizationStrategy,
  ) => Promise<PerformanceResult>,
  strategies: readonly JSONOptimizationStrategy[],
  iterations: number,
  randomize: boolean = true,
): Promise<Partial<Record<JSONOptimizationStrategy, PerformanceResult>>> {
  // Create test plan
  const testPlan: Array<{
    strategy: JSONOptimizationStrategy;
    iteration: number;
  }> = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const strategy of strategies) {
      testPlan.push({ strategy, iteration });
    }
  }

  // Shuffle if randomization is enabled
  const shuffledPlan = randomize ? shuffleArray(testPlan) : testPlan;

  // Execute tests and collect results by strategy
  const rawResults: Partial<
    Record<JSONOptimizationStrategy, PerformanceResult[]>
  > = {};
  for (const { strategy } of shuffledPlan) {
    if (!rawResults[strategy]) {
      rawResults[strategy] = [];
    }
    const result = await testFunction(strategy);
    rawResults[strategy]!.push(result);
  }

  // Average the results for each strategy
  const finalResults: Partial<
    Record<JSONOptimizationStrategy, PerformanceResult>
  > = {};
  for (const strategy of strategies) {
    if (rawResults[strategy] && rawResults[strategy]!.length > 0) {
      finalResults[strategy] = averagePerformanceResults(rawResults[strategy]!);
    }
  }

  return finalResults;
}
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
      // raw is raw dumping so it actually should be different
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

      throw error;
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

  // roughly equates 4.5mb, which is the max on api insert
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

  // Timed Retrieval with multiple iterations
  const getResults = await executePerformanceTests(
    (strategy) => config.retrieveGet(ids.id, strategy),
    JSON_OPTIMIZATION_STRATEGIES,
    PERFORMANCE_ITERATIONS,
    ENABLE_RANDOM_ORDER,
  );

  // TRPC tests (excluding streamingWorker)
  const trpcStrategies = JSON_OPTIMIZATION_STRATEGIES.filter(
    (s) => s !== "streamingWorker",
  );
  const trpcResults = await executePerformanceTests(
    (strategy) => config.retrieveTrpc(ids.id, ids.traceId, strategy),
    trpcStrategies,
    PERFORMANCE_ITERATIONS,
    ENABLE_RANDOM_ORDER,
  );

  const apiTimeLog = apiTime
    ? `API insertion: ${apiTime.toFixed(2)}ms`
    : "API insertion: skipped (payload too large)";

  // Generate logs
  const getLogs = JSON_OPTIMIZATION_STRATEGIES.map((opt) => {
    const result = getResults[opt];
    const baseLog = `  GET ${opt.padEnd(15)}: ${(result?.time ?? 0).toFixed(2)}ms`;
    return formatMetricsLog(baseLog, opt, result);
  }).join("\n");

  const trpcLogs = JSON_OPTIMIZATION_STRATEGIES.filter(
    (opt) => opt !== "streamingWorker",
  )
    .map((opt) => {
      const result = trpcResults[opt];
      const baseLog = `  TRPC ${opt.padEnd(15)}: ${(result?.time ?? 0).toFixed(2)}ms`;
      return formatMetricsLog(baseLog, opt, result);
    })
    .join("\n");

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
    )} MB, averaged over ${PERFORMANCE_ITERATIONS} iterations${ENABLE_RANDOM_ORDER ? " in random order" : ""}) ---\n` +
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
  }, 10000); // 10s timeout for small tests

  it("should measure performance for a m trace", async () => {
    await runTracePerformanceTest(1000, "m");
  }, 120000); // 2min timeout

  it("should measure performance for a l trace", async () => {
    await runTracePerformanceTest(6700, "l");
  }, 120000); // 2min timeout

  it("should measure performance for a xl trace", async () => {
    await runTracePerformanceTest(10000, "xl");
  }, 120000); // 2min timeout

  it("should measure performance for a xxl trace", async () => {
    await runTracePerformanceTest(40000, "xxl");
  }, 120000); // 2min timeout

  it("should measure performance for a s observation", async () => {
    await runObservationPerformanceTest(100, "s");
  }, 10000); // 10s timeout for small tests

  it("should measure performance for a m observation", async () => {
    await runObservationPerformanceTest(1000, "m");
  }, 120000); // 2min timeout

  it("should measure performance for a l observation", async () => {
    await runObservationPerformanceTest(6700, "l");
  }, 120000); // 2min timeout

  it("should measure performance for a xl observation", async () => {
    await runObservationPerformanceTest(10000, "xl");
  }, 120000); // 2min timeout

  it("should measure performance for a xxl observation", async () => {
    await runObservationPerformanceTest(40000, "xxl");
  }, 120000); // 2min timeout
});
