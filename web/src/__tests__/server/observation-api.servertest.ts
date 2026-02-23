import {
  createEvent,
  createObservation,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";
import {
  createEventsCh,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetObservationV1Response } from "@/src/features/public-api/types/observations";
import { v4 as uuidv4 } from "uuid";
import { GetObservationsV1Response } from "@/src/features/public-api/types/observations";
import snakeCase from "lodash/snakeCase";
import { env } from "@/src/env.mjs";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// Helper type for observation data
type ObservationData = {
  id: string;
  span_id?: string;
  trace_id: string;
  project_id: string;
  type: string;
  name?: string;
  model_id?: string;
  internal_model_id?: string;
  provided_model_name?: string;
  input?: string;
  output?: string;
  start_time?: number;
  end_time?: number;
  event_ts?: number;
  usage_details?: Record<string, number>;
  version?: string;
  [key: string]: any;
};

// Helper to create observation in the appropriate format
const createObservationData = (
  useEventsTable: boolean,
  data: ObservationData,
) => {
  if (useEventsTable) {
    // Events table: use microseconds, requires span_id
    return createEvent({
      ...data,
      span_id: data.span_id || data.id,
      model_id: data.model_id || data.internal_model_id,
      // Convert millisecond timestamps to microseconds if present
      start_time: data.start_time ? data.start_time : undefined,
      end_time: data.end_time ? data.end_time : undefined,
      event_ts: data.event_ts ? data.event_ts : undefined,
    });
  } else {
    // Observations table: use milliseconds, requires internal_model_id
    const { model_id, ...rest } = data;
    return createObservation({
      ...rest,
      internal_model_id: model_id || data.internal_model_id,
      // Timestamps already in milliseconds
    });
  }
};

// Helper to insert observations into the correct table
const insertObservations = async (
  useEventsTable: boolean,
  observations: any[],
) => {
  if (useEventsTable) {
    await createEventsCh(observations);
  } else {
    await createObservationsCh(observations);
  }
};

describe("/api/public/observations API Endpoint", () => {
  // Test suite factory to run tests against both implementations
  const runTestSuite = (useEventsTable: boolean) => {
    const suiteName = useEventsTable
      ? "with events table"
      : "with observations table";
    const queryParam = useEventsTable
      ? "&useEventsTable=true"
      : "&useEventsTable=false";
    const timeMultiplier = useEventsTable ? 1000 : 1; // microseconds vs milliseconds

    describe(`${suiteName}`, () => {
      describe("GET /api/public/observations/:id", () => {
        it("should GET an observation", async () => {
          const observationId = uuidv4();
          const traceId = uuidv4();

          const observation = createObservationData(useEventsTable, {
            id: observationId,
            project_id: projectId,
            trace_id: traceId,
            model_id: "b9854a5c92dc496b997d99d21",
            provided_model_name: "gpt-4o-2024-05-13",
            input: "input",
            output: "output",
            type: "GENERATION",
          });

          await insertObservations(useEventsTable, [observation]);

          const getEventRes = await makeZodVerifiedAPICall(
            GetObservationV1Response,
            "GET",
            `/api/public/observations/${observationId}?useEventsTable=${useEventsTable}`,
          );

          const expectedModelId = useEventsTable
            ? "model_id" in observation
              ? observation.model_id
              : undefined
            : "internal_model_id" in observation
              ? observation.internal_model_id
              : undefined;

          expect(getEventRes.body).toMatchObject({
            id: observationId,
            traceId: traceId,
            type: observation.type,
            modelId: expectedModelId,
            inputPrice: 0.000005,
            input: observation.input,
            output: observation.output,
          });
        });

        it.each([
          ["AGENT", "agent-observation"],
          ["TOOL", "tool-observation"],
          ["CHAIN", "chain-observation"],
          ["RETRIEVER", "retriever-observation"],
          ["EVALUATOR", "evaluator-observation"],
          ["EMBEDDING", "embedding-observation"],
          ["GUARDRAIL", "guardrail-observation"],
        ])("should GET observation with type %s", async (type, name) => {
          const observationId = uuidv4();
          const traceId = uuidv4();

          const observation = createObservationData(useEventsTable, {
            id: observationId,
            project_id: projectId,
            trace_id: traceId,
            type: type,
            name: name,
          });

          await insertObservations(useEventsTable, [observation]);

          const getEventRes = await makeZodVerifiedAPICall(
            GetObservationV1Response,
            "GET",
            `/api/public/observations/${observationId}?useEventsTable=${useEventsTable}`,
          );
          expect(getEventRes.body).toMatchObject({
            id: observationId,
            traceId: traceId,
            type: type,
            name: name,
          });
        });
      });

      describe("GET /api/public/observations", () => {
        it("should fetch all observations", async () => {
          const traceId = uuidv4();
          const observationId = uuidv4();

          const observation = createObservationData(useEventsTable, {
            id: observationId,
            trace_id: traceId,
            project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            model_id: "clrkwk4cb000408l576jl7koo",
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

          await insertObservations(useEventsTable, [observation]);

          const fetchedObservations = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations?traceId=${traceId}${queryParam}`,
            undefined,
          );

          expect(fetchedObservations.status).toBe(200);

          expect(fetchedObservations.body.data.length).toBe(1);
          expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
          expect(fetchedObservations.body.data[0]?.input).toEqual({
            key: "input",
          });
          expect(fetchedObservations.body.data[0]?.output).toEqual({
            key: "output",
          });
          expect(fetchedObservations.body.data[0]?.model).toEqual(
            "gpt-3.5-turbo",
          );
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
          const generationId = uuidv4();
          const spanId = uuidv4();

          const generationObservation = createObservationData(useEventsTable, {
            id: generationId,
            trace_id: traceId,
            project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            model_id: "model-1",
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

          const spanObservation = createObservationData(useEventsTable, {
            id: spanId,
            trace_id: traceId,
            project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            input: JSON.stringify({ key: "input" }),
            output: JSON.stringify({ key: "output" }),
            version: "2.0.0",
            type: "SPAN",
          });

          await insertObservations(useEventsTable, [
            generationObservation,
            spanObservation,
          ]);

          const fetchedObservations = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations?type=GENERATION&traceId=${traceId}${queryParam}`,
            undefined,
          );

          expect(fetchedObservations.status).toBe(200);

          expect(fetchedObservations.body.data.length).toBe(1);
          expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
          expect(fetchedObservations.body.data[0]?.input).toEqual({
            key: "input",
          });
          expect(fetchedObservations.body.data[0]?.output).toEqual({
            key: "output",
          });
          expect(fetchedObservations.body.data[0]?.type).toEqual("GENERATION");
        });

        it.each([
          ["userId", uuidv4()],
          ["traceId", uuidv4()],
          ["name", uuidv4()],
          ["version", uuidv4()],
          ["environment", uuidv4()],
        ])(
          "should fetch all observations filtered by a value (%s, %s)",
          async (prop: string, value: string) => {
            const traceId = uuidv4();
            const observationId = uuidv4();
            const timestamp = new Date("2021-01-01T00:00:00.000Z").getTime();

            if (prop === "userId" || prop === "environment") {
              const createdTrace = createTrace({
                id: traceId,
                [snakeCase(prop)]: value,
                project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              });

              await createTracesCh([createdTrace]);
            }

            const observation = createObservationData(useEventsTable, {
              id: observationId,
              trace_id: traceId,
              start_time: timestamp * timeMultiplier,
              end_time: timestamp * timeMultiplier,
              project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
              type: "GENERATION",
              [snakeCase(prop)]: value,
            });

            await insertObservations(useEventsTable, [observation]);

            const observations = await makeZodVerifiedAPICall(
              GetObservationsV1Response,
              "GET",
              `/api/public/observations?${prop}=${value}${queryParam}`,
            );

            expect(observations.body.meta.totalItems).toBe(1);
            expect(observations.body.data.length).toBe(1);
            const obsResult = observations.body.data[0];
            expect(obsResult.projectId).toBe(
              "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            );
            if (prop === "userId") return;
            expect((obsResult as any)[prop]).toBe(value);
          },
        );

        it("GET /observations with timestamp filters and pagination", async () => {
          const traceId = uuidv4();
          const timestamp1 = new Date("2021-01-01T00:00:00.000Z").getTime();
          const timestamp2 = new Date("2021-02-01T00:00:00.000Z").getTime();
          const timestamp3 = new Date("2021-03-01T00:00:00.000Z").getTime();
          const timestamp4 = new Date("2021-04-01T00:00:00.000Z").getTime();

          const obs1 = createObservationData(useEventsTable, {
            id: "observation-2021-01-01",
            trace_id: traceId,
            name: "generation-name",
            start_time: timestamp1 * timeMultiplier,
            event_ts: timestamp1 * timeMultiplier,
            end_time: timestamp1 * timeMultiplier,
            project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            type: "GENERATION",
          });

          const obs2 = createObservationData(useEventsTable, {
            id: "observation-2021-02-01",
            trace_id: traceId,
            name: "generation-name",
            start_time: timestamp2 * timeMultiplier,
            event_ts: timestamp2 * timeMultiplier,
            end_time: timestamp2 * timeMultiplier,
            project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            type: "SPAN",
          });

          const obs3 = createObservationData(useEventsTable, {
            id: "observation-2021-03-01",
            trace_id: traceId,
            name: "generation-name",
            start_time: timestamp3 * timeMultiplier,
            event_ts: timestamp3 * timeMultiplier,
            project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            type: "EVENT",
          });

          const obs4 = createObservationData(useEventsTable, {
            id: "observation-2021-04-01",
            trace_id: traceId,
            name: "generation-name",
            start_time: timestamp4 * timeMultiplier,
            event_ts: timestamp4 * timeMultiplier,
            end_time: timestamp4 * timeMultiplier,
            project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
            type: "GENERATION",
          });

          await insertObservations(useEventsTable, [obs1, obs2, obs3, obs4]);

          const fromTimestamp = "2021-02-01T00:00:00.000Z";
          const toTimestamp = "2021-04-01T00:00:00.000Z";

          // Test with both fromTimestamp and toTimestamp
          let fetchedObservations = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations?fromStartTime=${fromTimestamp}&toStartTime=${toTimestamp}&traceId=${traceId}${queryParam}`,
            undefined,
          );

          expect(fetchedObservations.body.data.length).toBe(2);
          expect(fetchedObservations.body.data[0]?.id).toBe(
            "observation-2021-03-01",
          );
          expect(fetchedObservations.body.data[1]?.id).toBe(
            "observation-2021-02-01",
          );
          expect(fetchedObservations.body.meta.totalItems).toBe(2);

          // Test with only fromTimestamp
          fetchedObservations = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations?fromStartTime=${fromTimestamp}&traceId=${traceId}${queryParam}`,
            undefined,
          );

          expect(fetchedObservations.body.data.length).toBe(3);
          expect(fetchedObservations.body.data[0]?.id).toBe(
            "observation-2021-04-01",
          );
          expect(fetchedObservations.body.data[1]?.id).toBe(
            "observation-2021-03-01",
          );
          expect(fetchedObservations.body.data[2]?.id).toBe(
            "observation-2021-02-01",
          );
          expect(fetchedObservations.body.meta.totalItems).toBe(3);

          // Test with only toTimestamp
          fetchedObservations = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations?toStartTime=${toTimestamp}&traceId=${traceId}${queryParam}`,
            undefined,
          );

          expect(fetchedObservations.body.data.length).toBe(3);
          expect(fetchedObservations.body.data[0]?.id).toBe(
            "observation-2021-03-01",
          );
          expect(fetchedObservations.body.data[1]?.id).toBe(
            "observation-2021-02-01",
          );
          expect(fetchedObservations.body.data[2]?.id).toBe(
            "observation-2021-01-01",
          );
          expect(fetchedObservations.body.meta.totalItems).toBe(3);

          // test pagination only
          fetchedObservations = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations?limit=1&page=2&traceId=${traceId}${queryParam}`,
            undefined,
          );

          expect(fetchedObservations.body.data.length).toBe(1);
          expect(fetchedObservations.body.data[0]?.id).toBe(
            "observation-2021-03-01",
          );
          expect(fetchedObservations.body.meta).toMatchObject({
            totalItems: 4,
            totalPages: 4,
            page: 2,
            limit: 1,
          });
        });
      });
    });
  };

  // Run tests with both implementations
  if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
    runTestSuite(true); // with events table
  }
  runTestSuite(false); // with observations table
});
