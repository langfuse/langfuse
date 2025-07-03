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
async function retrieveTraceGET(traceId: string) {
  const startTime = performance.now();
  await makeAPICall("GET", `/api/public/traces/${traceId}`);
  const endTime = performance.now();
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

async function retrieveObservationTRPC(observationId: string, traceId: string) {
  const caller = makeTrpcCaller();
  const startTime = performance.now();
  await caller.observations.byId({ observationId, traceId, projectId });
  const endTime = performance.now();
  return { time: endTime - startTime };
}
async function testTrace(size: number) {
  const {
    traceId,
    time: ingestionTime,
    payloadSizeInMB,
  } = await insertTrace(size);
  const { time: getTime } = await retrieveTraceGET(traceId);
  const { time: trpcTime } = await retrieveTraceTRPC(traceId);
  return { ingestionTime, getTime, trpcTime, payloadSizeInMB, size };
}
async function testObservation(size: number) {
  const {
    observationId,
    time: ingestionTime,
    traceId,
    payloadSizeInMB,
  } = await insertObservation(size);
  const { time: getTime } = await retrieveObservationGET(observationId);
  const { time: trpcTime } = await retrieveObservationTRPC(
    observationId,
    traceId,
  );
  return { ingestionTime, getTime, trpcTime, payloadSizeInMB, size };
}

async function testTraceDirect(size: number) {
  const {
    traceId,
    time: ingestionTime,
    payloadSizeInMB,
  } = await insertTraceDirect(size);
  const { time: getTime } = await retrieveTraceGET(traceId);
  const { time: trpcTime } = await retrieveTraceTRPC(traceId);
  return { ingestionTime, getTime, trpcTime, payloadSizeInMB, size };
}

async function testObservationDirect(size: number) {
  const {
    observationId,
    time: ingestionTime,
    traceId,
    payloadSizeInMB,
  } = await insertObservationDirect(size);
  const { time: getTime } = await retrieveObservationGET(observationId);
  const { time: trpcTime } = await retrieveObservationTRPC(
    observationId,
    traceId,
  );
  return { ingestionTime, getTime, trpcTime, payloadSizeInMB, size };
}

function logPerformance(
  entityType: "Trace" | "Observation",
  ingestionMethod: "API" | "Direct",
  result: Awaited<ReturnType<typeof testTrace | typeof testObservation>>,
) {
  console.log(
    `${entityType} (${ingestionMethod}, size: ${result.size}, ~${
      result.payloadSizeInMB
    } MB): Ingestion=${result.ingestionTime.toFixed(
      2,
    )}ms, GET=${result.getTime.toFixed(2)}ms, TRPC=${result.trpcTime.toFixed(
      2,
    )}ms`,
  );
}

// Note: it.each is not used to allow easier simple clicks to run single tests in the IDE
describe("JSON Performance Tests", () => {
  // Warm-up phase to mitigate cold start issues
  beforeAll(async () => {
    console.log("Running warm-up phase...");
    await testTrace(1);
    await testObservation(1);
    console.log("Warm-up complete.");
  }, 20000); // 20s timeout for warm-up

  it("should measure performance for a s trace", async () => {
    const size = 100;
    logPerformance("Trace", "API", await testTrace(size));
    logPerformance("Trace", "Direct", await testTraceDirect(size));
  });

  it("should measure performance for a m trace", async () => {
    const size = 1000;
    logPerformance("Trace", "API", await testTrace(size));
    logPerformance("Trace", "Direct", await testTraceDirect(size));
  });

  it("should measure performance for a l trace", async () => {
    const size = 6700;
    logPerformance("Trace", "API", await testTrace(size));
    logPerformance("Trace", "Direct", await testTraceDirect(size));
  });

  it("should measure performance for a xl trace", async () => {
    const size = 10000;
    // API is not supported for this size
    // logPerformance("Trace", "API", await testTrace(size));
    logPerformance("Trace", "Direct", await testTraceDirect(size));
  });

  it("should measure performance for a xxl trace", async () => {
    const size = 40000;
    // API is not supported for this size
    // logPerformance("Trace", "API", await testTrace(size));
    logPerformance("Trace", "Direct", await testTraceDirect(size));
  });

  it("should measure performance for a s observation", async () => {
    const size = 100;
    logPerformance("Observation", "API", await testObservation(size));
    logPerformance("Observation", "Direct", await testObservationDirect(size));
  });

  it("should measure performance for a m observation", async () => {
    const size = 1000;
    logPerformance("Observation", "API", await testObservation(size));
    logPerformance("Observation", "Direct", await testObservationDirect(size));
  });

  it("should measure performance for a xl observation", async () => {
    const size = 6700;
    logPerformance("Observation", "API", await testObservation(size));
    logPerformance("Observation", "Direct", await testObservationDirect(size));
  });

  it("should measure performance for a xxl observation", async () => {
    const size = 10000;
    // API is not supported for this size
    // logPerformance("Observation", "API", await testObservation(size));
    logPerformance("Observation", "Direct", await testObservationDirect(size));
  });

  it("should measure performance for a xxxl observation", async () => {
    const size = 40000;
    // API is not supported for this size
    // logPerformance("Observation", "API", await testObservation(size));
    logPerformance("Observation", "Direct", await testObservationDirect(size));
  });
});
