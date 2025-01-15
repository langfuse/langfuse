import { randomUUID } from "crypto";
import { makeAPICall } from "@/src/__tests__/test-utils";
import waitForExpect from "wait-for-expect";
import {
  getObservationById,
  getScoreById,
  getTraceById,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/ingestion API Endpoint", () => {
  it.each([
    [
      "plain",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
        },
      },
    ],
    [
      "metadata+io",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          metadata: { hello: "world" },
          input: "input",
          output: "output",
        },
      },
    ],
    [
      "complex-io",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          metadata: { hello: "world" },
          input: ["hello", { world: "world" }, [1, 2, 3]],
        },
      },
    ],
  ])(
    "should create traces via the ingestion API (%s)",
    async (_name: string, entity: any) => {
      const response = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const trace = await getTraceById(entity.body.id, projectId);
        expect(trace).toBeDefined();
        expect(trace!.id).toBe(entity.body.id);
        expect(trace!.projectId).toBe(projectId);
        expect(trace!.metadata).toEqual(entity.body?.metadata ?? {});
        expect(trace!.input).toEqual(entity.body?.input ?? null);
        expect(trace!.output).toEqual(entity.body?.output ?? null);
      });
    },
  );

  it.each([
    [
      "generation",
      "GENERATION",
      {
        id: randomUUID(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          parentObservationId: randomUUID(),
          startTime: new Date().toISOString(),
          model: "gpt-4",
          input: { text: "input" },
          output: { text: "output" },
        },
      },
    ],
    [
      "span",
      "SPAN",
      {
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
        },
      },
    ],
    [
      "span-complex-io",
      "SPAN",
      {
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          input: ["hello", { world: "world" }, [1, 2, 3]],
          output: ["hello", { world: [2, 3, "test"] }, [1, 2, 3]],
        },
      },
    ],
  ])(
    "should create observations via the ingestion API (%s)",
    async (_name: string, type: string, entity: any) => {
      const response = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const observation = await getObservationById(
          entity.body.id,
          projectId,
          true,
        );
        expect(observation).toBeDefined();
        expect(observation!.id).toBe(entity.body.id);
        expect(observation!.projectId).toBe(projectId);
        expect(observation!.metadata).toEqual(entity.body?.metadata ?? {});
        expect(observation!.input).toEqual(entity.body?.input ?? null);
        expect(observation!.output).toEqual(entity.body?.output ?? null);
        expect(observation!.type).toBe(type);
      });
    },
  );

  it.each([
    [
      "plain",
      {
        id: randomUUID(),
        type: "score-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          name: "score-name",
          traceId: randomUUID(),
          value: 100.5,
          observationId: randomUUID(),
        },
      },
    ],
  ])(
    "should create scores via the ingestion API (%s)",
    async (_name: string, entity: any) => {
      const response = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const score = await getScoreById(projectId, entity.body.id);
        expect(score).toBeDefined();
        expect(score!.id).toBe(entity.body.id);
        expect(score!.projectId).toBe(projectId);
        expect(score!.value).toEqual(100.5);
      });
    },
  );

  it("should fail for long trace name", async () => {
    const traceId = v4();

    const baseString =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
    const repeatCount = Math.ceil(1500 / baseString.length);
    const name = baseString.repeat(repeatCount);

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name,
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
      ],
    });

    expect(response.status).toBe(207);
    expect("errors" in response.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors[0].message).toBe("Invalid request data");
  });
});
