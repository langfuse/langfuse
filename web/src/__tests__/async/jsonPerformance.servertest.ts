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

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
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

  await waitForExpect(async () => {
    const trace = await getTraceById({
      traceId,
      projectId,
    });
    expect(trace).toBeDefined();
    expect(trace!.id).toBe(traceId);
    expect(trace!.projectId).toBe(projectId);
  });

  return { traceId, time: endTime - startTime, payloadSizeInMB };
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

  await waitForExpect(async () => {
    const observation = await getObservationById({
      id: observationId,
      projectId,
      fetchWithInputOutput: true,
    });
    expect(observation).toBeDefined();
    expect(observation!.id).toBe(observationId);
    expect(observation!.projectId).toBe(projectId);
  });

  return { observationId, traceId, time: endTime - startTime, payloadSizeInMB };
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

  await waitForExpect(async () => {
    const trace = await getTraceById({
      traceId,
      projectId,
    });
    expect(trace).toBeDefined();
    expect(trace!.id).toBe(traceId);
    expect(trace!.projectId).toBe(projectId);
  });

  return { traceId, time: endTime - startTime, payloadSizeInMB };
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

  await waitForExpect(async () => {
    const observation = await getObservationById({
      id: observationId,
      projectId,
      fetchWithInputOutput: true,
    });
    expect(observation).toBeDefined();
    expect(observation!.id).toBe(observationId);
    expect(observation!.projectId).toBe(projectId);
  });

  return { observationId, traceId, time: endTime - startTime, payloadSizeInMB };
}

// Helper functions for retrieval
async function retrieveTraceGET(
  traceId: string,
  optimization: "original" | "jsonsimd" | "worker",
) {
  const startTime = performance.now();
  const result = await makeAPICall(
    "GET",
    `/api/public/traces/${traceId}?optimization=${optimization}`,
  );
  const endTime = performance.now();
  const body = result.body as any;
  if (optimization !== "original") {
    expect(body.optimization).toBe(optimization);
  }
  return { time: endTime - startTime };
}

async function retrieveObservationGET(observationId: string) {
  const startTime = performance.now();
  await makeAPICall("GET", `/api/public/observations/${observationId}`);
  const endTime = performance.now();
  return { time: endTime - startTime };
}

async function retrieveTraceTRPC(traceId: string) {
  const caller = makeTrpcCaller();
  const startTime = performance.now();
  await caller.traces.byId({ traceId, projectId });
  const endTime = performance.now();
  return { time: endTime - startTime };
}

async function retrieveObservationTRPC(
  observationId: string,
  traceId: string,
  optimization: "original" | "jsonsimd" | "worker",
) {
  const caller = makeTrpcCaller();
  const startTime = performance.now();
  // Assuming the backend will be updated to handle an 'optimization' parameter.
  // For now, we'll use byId for original and byIdV2 for others as a stand-in.
  if (optimization === "original") {
    await caller.observations.byId({ observationId, traceId, projectId });
  } else {
    const result = await caller.observations.byIdV2({
      observationId,
      traceId,
      projectId,
    });
    // The 'v2' here is a placeholder for the actual optimization name
    expect(result.optimization).toBe("v2");
  }
  const endTime = performance.now();
  return { time: endTime - startTime };
}

async function runTracePerformanceTest(size: number, name: string) {
  let traceId: string;
  let payloadSizeInMB: number;
  let apiTime: number | null = null;
  let directTime: number;

  if (size <= 6700) {
    const apiRes = await insertTrace(size);
    traceId = apiRes.traceId;
    payloadSizeInMB = apiRes.payloadSizeInMB;
    apiTime = apiRes.time;
    const directRes = await insertTraceDirect(size);
    directTime = directRes.time;
  } else {
    const directRes = await insertTraceDirect(size);
    traceId = directRes.traceId;
    payloadSizeInMB = directRes.payloadSizeInMB;
    directTime = directRes.time;
  }

  // Warm-up
  await retrieveTraceGET(traceId, "original");

  // Timed Retrieval
  const originalGetTime = (await retrieveTraceGET(traceId, "original")).time;
  const simdjsonGetTime = (await retrieveTraceGET(traceId, "jsonsimd")).time;
  const workerGetTime = (await retrieveTraceGET(traceId, "worker")).time;

  const apiTimeLog = apiTime
    ? `API insertion: ${apiTime.toFixed(2)}ms`
    : "API insertion: skipped (payload too large)";

  console.log(
    `--- Trace (${name}, size: ${size}, ~${payloadSizeInMB.toFixed(2)} MB) ---\n` +
      `${apiTimeLog}\n` +
      `Direct insertion: ${directTime.toFixed(2)}ms\n` +
      `Retrievals:\n` +
      `  GET original: ${originalGetTime.toFixed(2)}ms\n` +
      `  GET jsonsimd: ${simdjsonGetTime.toFixed(2)}ms\n` +
      `  GET worker:   ${workerGetTime.toFixed(2)}ms`,
  );
}

async function runObservationPerformanceTest(size: number, name: string) {
  let observationId: string;
  let traceId: string;
  let payloadSizeInMB: number;
  let apiTime: number | null = null;
  let directTime: number;

  if (size <= 6700) {
    const apiRes = await insertObservation(size);
    observationId = apiRes.observationId;
    traceId = apiRes.traceId;
    payloadSizeInMB = apiRes.payloadSizeInMB;
    apiTime = apiRes.time;
    const directRes = await insertObservationDirect(size);
    directTime = directRes.time;
  } else {
    const directRes = await insertObservationDirect(size);
    observationId = directRes.observationId;
    traceId = directRes.traceId;
    payloadSizeInMB = directRes.payloadSizeInMB;
    directTime = directRes.time;
  }

  // Warm-up
  await retrieveObservationTRPC(observationId, traceId, "original");

  // Timed Retrieval
  const originalTrpcTime = (
    await retrieveObservationTRPC(observationId, traceId, "original")
  ).time;
  const simdjsonTrpcTime = (
    await retrieveObservationTRPC(observationId, traceId, "jsonsimd")
  ).time;
  const workerTrpcTime = (
    await retrieveObservationTRPC(observationId, traceId, "worker")
  ).time;

  const apiTimeLog = apiTime
    ? `API insertion: ${apiTime.toFixed(2)}ms`
    : "API insertion: skipped (payload too large)";

  console.log(
    `--- Observation (${name}, size: ${size}, ~${payloadSizeInMB.toFixed(2)} MB) ---\n` +
      `${apiTimeLog}\n` +
      `Direct insertion: ${directTime.toFixed(2)}ms\n` +
      `Retrievals:\n` +
      `  TRPC original: ${originalTrpcTime.toFixed(2)}ms\n` +
      `  TRPC jsonsimd: ${simdjsonTrpcTime.toFixed(2)}ms\n` +
      `  TRPC worker:   ${workerTrpcTime.toFixed(2)}ms`,
  );
}

// Note: it.each is not used to allow easier simple clicks to run single tests in the IDE
describe("JSON Performance Tests", () => {
  // Warm-up phase to mitigate cold start issues
  beforeAll(async () => {
    console.log("Running warm-up phase...");
    const { traceId } = await insertTrace(1);
    await retrieveTraceGET(traceId, "original");
    const { observationId, traceId: obsTraceId } = await insertObservation(1);
    await retrieveObservationTRPC(observationId, obsTraceId, "original");
    console.log("Warm-up complete.");
  }, 20000); // 20s timeout for warm-up

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
  });

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
  });
});
