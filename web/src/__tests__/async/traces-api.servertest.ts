import { createObservation, createTrace } from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createTracesCh,
} from "@langfuse/shared/src/server";
import {
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
} from "@/src/__tests__/test-utils";
import {
  GetTracesV1Response,
  GetTraceV1Response,
} from "@/src/features/public-api/types/traces";
import { randomUUID } from "crypto";
import { snakeCase } from "lodash";

describe("/api/public/traces API Endpoint", () => {
  it("should create and get a trace via /traces", async () => {
    const createdTrace = createTrace({
      name: "trace-name",
      user_id: "user-1",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observations = [
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        input: "input",
        output: "output",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-2",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 100000,
        input: "input-2",
        output: "output-2",
      }),
    ];

    await createTracesCh([createdTrace]);
    await createObservationsCh(observations);

    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      "/api/public/traces/" + createdTrace.id,
    );

    expect(trace.body.name).toBe("trace-name");
    expect(trace.body.release).toBe("1.0.0");
    expect(trace.body.externalId).toBeNull();
    expect(trace.body.version).toBe("2.0.0");
    expect(trace.body.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(trace.body.latency).toBe(100);
    expect(trace.body.observations.length).toBe(2);
    expect(trace.body.scores.length).toBe(0);
    expect(trace.body.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "observation-name-2",
          input: "input-2",
          output: "output-2",
        }),
        expect.objectContaining({
          name: "observation-name",
          input: "input",
          output: "output",
        }),
      ]),
    );
  });

  it("should fetch all traces", async () => {
    const timestamp = new Date();
    const createdTrace = createTrace({
      name: "trace-name",
      user_id: "user-1",
      timestamp: timestamp.getTime(),
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value", jsonKey: JSON.stringify({ foo: "bar" }) },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observations = [
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name",
        end_time: timestamp.getTime(),
        start_time: timestamp.getTime() - 1000,
        input: "input",
        output: "output",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-2",
        end_time: timestamp.getTime(),
        start_time: timestamp.getTime() - 100000,
        input: "input-2",
        output: "output-2",
      }),
    ];

    await createTracesCh([createdTrace]);
    await createObservationsCh(observations);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      "/api/public/traces",
    );

    expect(traces.body.meta.totalItems).toBeGreaterThanOrEqual(1);
    expect(traces.body.data.length).toBeGreaterThanOrEqual(1);
    const trace = traces.body.data.find((t) => t.id === createdTrace.id);
    expect(trace).toBeTruthy();
    if (!trace) {
      return; // to satisfy TypeScript
    }
    expect(trace.name).toBe("trace-name");
    expect(trace.release).toBe("1.0.0");
    expect(trace.metadata.key).toBe("value");
    expect(trace.metadata.jsonKey).toEqual({ foo: "bar" });
    expect(trace.externalId).toBeNull();
    expect(trace.version).toBe("2.0.0");
    expect(trace.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(trace.latency).toBe(100);
    expect(trace.observations.length).toBe(2);
    expect(trace.scores.length).toBe(0);
    expect(trace.timestamp).toBe(timestamp.toISOString());
  });

  it.each([
    ["userId", randomUUID()],
    ["sessionId", randomUUID()],
    ["release", randomUUID()],
    ["version", randomUUID()],
    ["name", randomUUID()],
  ])(
    "should fetch all traces filtered by a value (%s, %s)",
    async (prop: string, value: string) => {
      const createdTrace = createTrace({
        [snakeCase(prop)]: value,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
      });

      await createTracesCh([createdTrace]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces?${prop}=${value}`,
      );

      expect(traces.body.meta.totalItems).toBe(1);
      expect(traces.body.data.length).toBe(1);
      const trace = traces.body.data[0];
      expect(trace.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
      expect((trace as any)[prop]).toBe(value);
    },
  );

  it("should fetch all traces filtered by a tag", async () => {
    const tag = randomUUID();
    const createdTrace = createTrace({
      name: "trace-name",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      tags: [tag],
    });

    await createTracesCh([createdTrace]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?tags=${[tag]}`,
    );

    expect(traces.body.meta.totalItems).toBe(1);
    expect(traces.body.data.length).toBe(1);
    const trace = traces.body.data[0];
    expect(trace.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  });

  it("should fetch all traces with pagination", async () => {
    const tag = randomUUID();
    const createdTrace1 = createTrace({
      name: "trace-name",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      tags: [tag],
    });
    const createdTrace2 = createTrace({
      name: "trace-name",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      tags: [tag],
    });
    const createdTrace3 = createTrace({
      name: "trace-name",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      tags: [tag],
    });

    await createTracesCh([createdTrace1, createdTrace2, createdTrace3]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?tags=${[tag]}&limit=1&offset=1`,
    );

    expect(traces.body.meta.totalItems).toBe(3);
    expect(traces.body.data.length).toBe(1);
    expect(traces.body.meta.totalPages).toBe(3);
    const trace = traces.body.data[0];
    expect(trace.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  });

  it("should fetch all traces with custom order", async () => {
    const tag = randomUUID();
    const createdTrace1 = createTrace({
      name: "trace-name1",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      tags: [tag],
    });
    const createdTrace2 = createTrace({
      name: "trace-name2",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      tags: [tag],
    });

    await createTracesCh([createdTrace1, createdTrace2]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?tags=${[tag]}&orderBy=name.desc`,
    );

    expect(traces.body.meta.totalItems).toBe(2);
    expect(traces.body.data.length).toBe(2);
    const trace1 = traces.body.data[0];
    expect(trace1.name).toBe("trace-name2");
    const trace2 = traces.body.data[1];
    expect(trace2.name).toBe("trace-name1");
  });

  it("should return 400 error when page=0", async () => {
    const response = await makeZodVerifiedAPICallSilent(
      GetTracesV1Response,
      "GET",
      "/api/public/traces?page=0&limit=10",
    );

    expect(response.status).toBe(400);
  });
});
