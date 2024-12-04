import { createObservation as createObservationObject } from "@/src/__tests__/fixtures/tracing-factory";
import { createObservationsCh as createObservationsInClickhouse } from "@/src/__tests__/async/repositories/clickhouse-helpers";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetObservationV1Response } from "@/src/features/public-api/types/observations";
import { v4 } from "uuid";
import { v4 as uuidv4 } from "uuid";
import { GetObservationsV1Response } from "@/src/features/public-api/types/observations";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/observations API Endpoint", () => {
  describe("GET /api/public/observations/:id", () => {
    it("should GET an observation", async () => {
      const observationId = v4();
      const traceId = v4();

      const observation = createObservationObject({
        id: observationId,
        project_id: projectId,
        trace_id: traceId,
        internal_model_id: "b9854a5c92dc496b997d99d21",
        provided_model_name: "gpt-4o-2024-05-13",
        input: "input",
        output: "output",
      });

      await createObservationsInClickhouse([observation]);

      const getEventRes = await makeZodVerifiedAPICall(
        GetObservationV1Response,
        "GET",
        "/api/public/observations/" + observationId,
      );
      expect(getEventRes.body).toMatchObject({
        id: observationId,
        traceId: traceId,
        type: observation.type,
        modelId: observation.internal_model_id,
        inputPrice: 0.000005,
        input: observation.input,
        output: observation.output,
      });
    });
  });
});

describe("/api/public/observations API Endpoint", () => {
  it("should fetch all observations", async () => {
    const traceId = uuidv4();

    const observation = createObservationObject({
      id: uuidv4(),
      trace_id: traceId,
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      internal_model_id: "clrkwk4cb000408l576jl7koo",
      provided_model_name: "gpt-3.5-turbo",
      input: JSON.stringify({ key: "input" }),
      output: JSON.stringify({ key: "output" }),
      usage_details: {
        input: 10,
        output: 20,
        total: 30,
      },
      version: "2.0.0",
      type: "GENERATION",
    });

    await createObservationsInClickhouse([observation]);

    const fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations?traceId=" + traceId,
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    expect(fetchedObservations.body.data.length).toBe(1);
    expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
    expect(fetchedObservations.body.data[0]?.input).toEqual({ key: "input" });
    expect(fetchedObservations.body.data[0]?.output).toEqual({ key: "output" });
    expect(fetchedObservations.body.data[0]?.model).toEqual("gpt-3.5-turbo");
    expect(fetchedObservations.body.data[0]?.modelId).toEqual(
      "clrkwk4cb000408l576jl7koo",
    );
    expect(
      fetchedObservations.body.data[0]?.calculatedInputCost,
    ).toBeGreaterThan(0);
    expect(
      fetchedObservations.body.data[0]?.calculatedOutputCost,
    ).toBeGreaterThan(0);
    expect(
      fetchedObservations.body.data[0]?.calculatedTotalCost,
    ).toBeGreaterThan(0);
  });

  it("should fetch all observations, filtered by generations", async () => {
    const traceId = uuidv4();

    const generationObservation = createObservationObject({
      id: uuidv4(),
      trace_id: traceId,
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      internal_model_id: "model-1",
      provided_model_name: "gpt-3.5-turbo",
      input: JSON.stringify({ key: "input" }),
      output: JSON.stringify({ key: "output" }),
      usage_details: {
        input: 10,
        output: 20,
        total: 30,
      },
      version: "2.0.0",
      type: "GENERATION",
    });

    const spanObservation = createObservationObject({
      id: uuidv4(),
      trace_id: traceId,
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      input: JSON.stringify({ key: "input" }),
      output: JSON.stringify({ key: "output" }),
      version: "2.0.0",
      type: "SPAN",
    });

    await createObservationsInClickhouse([
      generationObservation,
      spanObservation,
    ]);

    const fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations?type=GENERATION&traceId=" + traceId,
      undefined,
    );

    console.log(fetchedObservations.body);

    expect(fetchedObservations.status).toBe(200);

    expect(fetchedObservations.body.data.length).toBe(1);
    expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
    expect(fetchedObservations.body.data[0]?.input).toEqual({ key: "input" });
    expect(fetchedObservations.body.data[0]?.output).toEqual({ key: "output" });
    expect(fetchedObservations.body.data[0]?.type).toEqual("GENERATION");
  });

  it("GET /observations with timestamp filters and pagination", async () => {
    const traceId = v4();
    const obs1 = createObservationObject({
      id: "observation-2021-01-01",
      trace_id: traceId,
      name: "generation-name",
      start_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      end_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      type: "GENERATION",
    });

    const obs2 = createObservationObject({
      id: "observation-2021-02-01",
      trace_id: traceId,
      name: "generation-name",
      start_time: new Date("2021-02-01T00:00:00.000Z").getTime(),
      end_time: new Date("2021-02-01T00:00:00.000Z").getTime(),
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      type: "SPAN",
    });
    const obs3 = createObservationObject({
      id: "observation-2021-03-01",
      trace_id: traceId,
      name: "generation-name",
      start_time: new Date("2021-03-01T00:00:00.000Z").getTime(),
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      type: "EVENT",
    });
    const obs4 = createObservationObject({
      id: "observation-2021-04-01",
      trace_id: traceId,
      name: "generation-name",
      start_time: new Date("2021-04-01T00:00:00.000Z").getTime(),
      end_time: new Date("2021-04-01T00:00:00.000Z").getTime(),
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      type: "GENERATION",
    });

    await createObservationsInClickhouse([obs1, obs2, obs3, obs4]);

    const fromTimestamp = "2021-02-01T00:00:00.000Z";
    const toTimestamp = "2021-04-01T00:00:00.000Z";

    // Test with both fromTimestamp and toTimestamp
    let fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      `/api/public/observations?fromStartTime=${fromTimestamp}&toStartTime=${toTimestamp}&traceId=${traceId}`,
      undefined,
    );

    expect(fetchedObservations.body.data.length).toBe(2);
    expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-03-01");
    expect(fetchedObservations.body.data[1]?.id).toBe("observation-2021-02-01");
    expect(fetchedObservations.body.meta.totalItems).toBe(2);

    // Test with only fromTimestamp
    fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      `/api/public/observations?fromStartTime=${fromTimestamp}&traceId=${traceId}`,
      undefined,
    );

    expect(fetchedObservations.body.data.length).toBe(3);
    expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-04-01");
    expect(fetchedObservations.body.data[1]?.id).toBe("observation-2021-03-01");
    expect(fetchedObservations.body.data[2]?.id).toBe("observation-2021-02-01");
    expect(fetchedObservations.body.meta.totalItems).toBe(3);

    // Test with only toTimestamp
    fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      `/api/public/observations?toStartTime=${toTimestamp}&traceId=${traceId}`,
      undefined,
    );

    expect(fetchedObservations.body.data.length).toBe(3);
    expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-03-01");
    expect(fetchedObservations.body.data[1]?.id).toBe("observation-2021-02-01");
    expect(fetchedObservations.body.data[2]?.id).toBe("observation-2021-01-01");
    expect(fetchedObservations.body.meta.totalItems).toBe(3);

    // test pagination only
    fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      `/api/public/observations?limit=1&page=2&traceId=${traceId}`,
      undefined,
    );

    expect(fetchedObservations.body.data.length).toBe(1);
    expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-03-01");
    expect(fetchedObservations.body.meta).toMatchObject({
      totalItems: 4,
      totalPages: 4,
      page: 2,
      limit: 1,
    });
  });
});
