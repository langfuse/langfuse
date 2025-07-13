import {
  getObservationsForTrace,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { createObservation } from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("Observations String Conversion Test", () => {
  it("should return observations with string input/output when convertToString is true", async () => {
    const traceId = v4();
    const observationId = v4();

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "GENERATION",
      name: "Test Observation",
      start_time: Date.now(),
      end_time: Date.now() + 1000,
      input: JSON.stringify({
        prompt: "Test prompt",
        parameters: { temperature: 0.7 },
      }),
      output: "This is a plain text response",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });

    await createObservationsCh([observation]);

    // Test with string conversion
    const observationsWithStrings = await getObservationsForTrace<true, true>({
      traceId,
      projectId,
      includeIO: true,
      convertToString: true,
    });

    expect(observationsWithStrings).toHaveLength(1);
    const obsWithString = observationsWithStrings[0];

    // Input/output should be raw strings
    expect(typeof obsWithString.input).toBe("string");
    expect(typeof obsWithString.output).toBe("string");
    expect(obsWithString.input).toBe(observation.input);
    expect(obsWithString.output).toBe(observation.output);

    // Test with regular conversion (JSON parsing)
    const observationsWithParsed = await getObservationsForTrace<true, false>({
      traceId,
      projectId,
      includeIO: true,
      convertToString: false,
    });

    expect(observationsWithParsed).toHaveLength(1);
    const obsWithParsed = observationsWithParsed[0];

    // Input should be parsed JSON object, output should be plain string
    expect(typeof obsWithParsed.input).toBe("object");
    expect(obsWithParsed.input).toEqual({
      prompt: "Test prompt",
      parameters: { temperature: 0.7 },
    });
    expect(typeof obsWithParsed.output).toBe("string");
    expect(obsWithParsed.output).toBe("This is a plain text response");
  });

  it("should handle observations without input/output", async () => {
    const traceId = v4();
    const observationId = v4();

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "SPAN",
      name: "Test Span",
      start_time: Date.now(),
      end_time: Date.now() + 500,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    });

    await createObservationsCh([observation]);

    const observationsWithStrings = await getObservationsForTrace<true, true>({
      traceId,
      projectId,
      includeIO: true,
      convertToString: true,
    });

    expect(observationsWithStrings).toHaveLength(1);
    const obs = observationsWithStrings[0];

    expect(obs.input).toBeNull();
    expect(obs.output).toBeNull();
    expect(obs.type).toBe("SPAN");
  });
});
