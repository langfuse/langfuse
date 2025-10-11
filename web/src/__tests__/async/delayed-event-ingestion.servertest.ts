import { randomUUID } from "crypto";
import { makeAPICall } from "@/src/__tests__/test-utils";
import waitForExpect from "wait-for-expect";
import { clickhouseClient } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// Helper to get the delay from environment or default to 5s for tests
const getDelayMs = () => {
  return env.LANGFUSE_DELAYED_EVENT_INGESTION_DELAY_MS ?? 5000;
};

// Helper function to query events table by span_id
async function getEventBySpanId(
  projectId: string,
  spanId: string,
): Promise<any | null> {
  const client = clickhouseClient();
  const result = await client.query({
    query: `
      SELECT *
      FROM events
      WHERE project_id = {projectId: String}
      AND span_id = {spanId: String}
      ORDER BY event_ts DESC
      LIMIT 1
    `,
    format: "JSONEachRow",
    query_params: { projectId, spanId },
  });

  const rows = await result.json();
  return rows.length > 0 ? rows[0] : null;
}

describe("Delayed Event Ingestion Queue", () => {
  it("should insert observation into events table after delay", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();

    // Insert observation
    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-observation",
          },
        },
      ],
    });

    expect(response.status).toBe(207);

    // Wait for delay + buffer for processing
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 3000));

    // Query events table
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        expect(event.span_id).toBe(observationId);
        expect(event.trace_id).toBe(traceId);
        expect(event.project_id).toBe(projectId);
        expect(event.name).toBe("test-observation");
        expect(event.source).toBe("delayed-ingestion");
      },
      15_000,
      1000,
    );
  }, 25_000);

  it("should enrich observation with trace userId when trace arrives within delay window", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();
    const userId = "test-user-123";

    // Insert observation first
    const obsResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-observation-with-user",
          },
        },
      ],
    });

    expect(obsResponse.status).toBe(207);

    // Wait a bit, then insert trace with userId (still within delay window)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const traceResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            userId: userId,
          },
        },
      ],
    });

    expect(traceResponse.status).toBe(207);

    // Wait for delay + buffer
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 3000));

    // Verify event has userId
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        expect(event.user_id).toBe(userId);
      },
      15_000,
      1000,
    );
  }, 25_000);

  it("should enrich observation with trace sessionId when trace arrives within delay window", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();
    const sessionId = "test-session-456";

    // Insert observation first
    const obsResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-observation-with-session",
          },
        },
      ],
    });

    expect(obsResponse.status).toBe(207);

    // Wait a bit, then insert trace with sessionId
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const traceResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            sessionId: sessionId,
          },
        },
      ],
    });

    expect(traceResponse.status).toBe(207);

    // Wait for delay + buffer
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 3000));

    // Verify event has sessionId
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        expect(event.session_id).toBe(sessionId);
      },
      15_000,
      1000,
    );
  }, 25_000);

  it("should enrich observation with trace metadata when trace arrives within delay window", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();
    const traceMetadata = { traceKey: "traceValue", shared: "fromTrace" };

    // Insert observation first
    const obsResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-observation-with-metadata",
          },
        },
      ],
    });

    expect(obsResponse.status).toBe(207);

    // Wait a bit, then insert trace with metadata
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const traceResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            metadata: traceMetadata,
          },
        },
      ],
    });

    expect(traceResponse.status).toBe(207);

    // Wait for delay + buffer
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 3000));

    // Verify event has merged metadata
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        expect(event.metadata).toMatchObject(traceMetadata);
      },
      15_000,
      1000,
    );
  }, 25_000);

  it("should merge metadata with latest top-level keys taking precedence", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();

    // Insert observation with metadata first
    const obsResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-metadata-merge",
            metadata: { a: 1, b: 2 },
          },
        },
      ],
    });

    expect(obsResponse.status).toBe(207);

    // Wait a bit, then insert trace with overlapping metadata (later timestamp)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const traceResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date(Date.now() + 1000).toISOString(), // Later timestamp
          body: {
            id: traceId,
            metadata: { b: 3, c: 4 },
          },
        },
      ],
    });

    expect(traceResponse.status).toBe(207);

    // Wait for delay + buffer
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 3000));

    // Verify final metadata: observation metadata takes precedence
    // Based on the code, trace metadata is merged first, then observation metadata
    // So the final result should be {a: 1, b: 2, c: 4}
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        // Observation metadata takes precedence over trace metadata
        expect(event.metadata).toMatchObject({
          a: 1,
          b: 2, // observation's b takes precedence from trace
          c: 4,
        });
      },
      15_000,
      1000,
    );
  }, 25_000);

  it("should NOT enrich observation with userId when trace arrives after delay window", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();
    const userId = "late-user-789";

    // Insert observation first
    const obsResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-late-trace",
          },
        },
      ],
    });

    expect(obsResponse.status).toBe(207);

    // Wait for delay to pass BEFORE inserting trace
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 2000));

    // Now insert trace (too late)
    const traceResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            userId: userId,
          },
        },
      ],
    });

    expect(traceResponse.status).toBe(207);

    // Wait a bit more for processing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify event does NOT have userId (trace was too late)
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        // userId should be null or undefined since trace arrived late
        expect(event.user_id).toBe("");
      },
      10_000,
      1000,
    );
  }, 30_000);

  it("should use latest trace update when multiple trace events modify userId", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();

    // Insert observation first
    const obsResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-multiple-updates",
          },
        },
      ],
    });

    expect(obsResponse.status).toBe(207);

    // Insert first trace update
    await new Promise((resolve) => setTimeout(resolve, 500));

    const trace1Response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            userId: "user1",
          },
        },
      ],
    });

    expect(trace1Response.status).toBe(207);

    // Insert second trace update with later timestamp
    await new Promise((resolve) => setTimeout(resolve, 500));

    const trace2Response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date(Date.now() + 1000).toISOString(), // Later timestamp
          body: {
            id: traceId,
            userId: "user2",
          },
        },
      ],
    });

    expect(trace2Response.status).toBe(207);

    // Wait for delay + buffer
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 3000));

    // Verify event has the latest userId (user2)
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        expect(event.user_id).toBe("user2");
      },
      15_000,
      1000,
    );
  }, 25_000);

  it("should prioritize observation metadata over trace metadata for overlapping keys", async () => {
    const observationId = randomUUID();
    const traceId = randomUUID();

    // Insert trace first with metadata
    const traceResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            metadata: { type: "trace", other: 2 },
          },
        },
      ],
    });

    expect(traceResponse.status).toBe(207);

    // Wait a bit, then insert observation with overlapping metadata
    await new Promise((resolve) => setTimeout(resolve, 500));

    const obsResponse = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            name: "test-obs-priority",
            metadata: { type: "obs", value: 1 },
          },
        },
      ],
    });

    expect(obsResponse.status).toBe(207);

    // Wait for delay + buffer
    const delayMs = getDelayMs();
    await new Promise((resolve) => setTimeout(resolve, delayMs + 3000));

    // Verify observation metadata takes precedence for "type" key
    await waitForExpect(
      async () => {
        const event = await getEventBySpanId(projectId, observationId);
        expect(event).toBeDefined();
        // Observation metadata should take precedence
        expect(event.metadata).toMatchObject({
          type: "obs", // from observation
          value: "1", // from observation
          other: "2", // from trace
        });
      },
      15_000,
      1000,
    );
  }, 25_000);
});
