import { describe, expect, it } from "vitest";
import type { Observation } from "../../../domain";
import { transcriptFixtures } from "./index";
import { createObservation } from "../../test-utils";
import { convertObservation } from "../../repositories/observations_converters";
import { orderObservations } from "../ordering";
import { assembleTranscript } from "../transcript";
import type { Transcript } from "../types";
import { formatTranscript } from "./format-transcript";
import { orderSupportRoutingFixture } from "./session/order-support-routing";

/**
 * Build every trace on its own, never a whole session, in trace tree order,
 * and concatenate the threads in the order the traces first appear.
 */
function assembleTranscriptPerTrace(
  observations: Observation[],
): Transcript | null {
  const traces = new Map<string | null, Observation[]>();
  for (const observation of observations) {
    const trace = traces.get(observation.traceId) ?? [];
    trace.push(observation);
    traces.set(observation.traceId, trace);
  }
  const threads = [...traces.values()].flatMap(
    (trace) => assembleTranscript(orderObservations(trace))?.threads ?? [],
  );
  return threads.length ? { threads } : null;
}

/**
 * Structural checks on fixtures and exact transcript expectations.
 */
describe("transcript fixtures", () => {
  const traceId = "trace";
  const generation = (id: string, input: string[], output: string[]) =>
    convertObservation(
      createObservation({
        id,
        trace_id: traceId,
        type: "GENERATION",
        start_time: `2026-01-01T12:00:0${id}.000Z`,
        input: JSON.stringify(
          input.map((content) => ({ role: "user", content })),
        ),
        output: JSON.stringify(
          output.map((content) => ({ role: "user", content })),
        ),
      }),
    );

  it("skips generations without messages", () => {
    const empty = generation("1", [], []);
    expect(assembleTranscript([empty])).toBeNull();
    const transcript = assembleTranscript([empty, generation("2", ["A"], [])]);
    expect(transcript?.threads).toHaveLength(1);
    expect(transcript?.threads[0].currentTurn.observations).toEqual([
      { id: "2", traceId },
    ]);
  });

  it("continues the newest matching thread without duplicating history", () => {
    const transcript = assembleTranscript([
      generation("1", ["A"], []),
      generation("2", ["B"], []),
      generation("3", ["B", "A"], ["C"]),
    ]);
    expect(
      transcript?.threads.map((thread) => thread.currentTurn.observations),
    ).toEqual([
      [{ id: "1", traceId }],
      [
        { id: "2", traceId },
        { id: "3", traceId },
      ],
    ]);
    expect(
      transcript?.threads[1].currentTurn.messages.map(
        (message) => message.observationId,
      ),
    ).toEqual(["2", "3", "3"]);
  });

  it("does not list a replay-only generation as a contributor", () => {
    const transcript = assembleTranscript([
      generation("1", ["A"], ["B"]),
      generation("2", ["A", "B"], []),
    ]);
    expect(transcript?.threads).toHaveLength(1);
    expect(transcript?.threads[0].currentTurn.observations).toEqual([
      { id: "1", traceId },
    ]);
  });

  it("have unique names", () => {
    const names = transcriptFixtures.map((fixture) => fixture.name);
    expect(new Set(names).size).toBe(names.length);
  });

  describe.each(transcriptFixtures)("$name", (fixture) => {
    const ids = fixture.observations.map((observation) => observation.id);
    const traceIds = new Set(
      fixture.observations.map((observation) => observation.trace_id),
    );

    it("has unique observation ids", () => {
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("matches its scope", () => {
      if (fixture.scope === "trace") {
        expect(traceIds.size).toBe(1);
        return;
      }

      // Session scope spans several traces; session identity lives on the
      // trace, not on observation records, so we only assert the shape here.
      expect(traceIds.size).toBeGreaterThan(1);
    });

    // Complete each seed into a full ClickHouse observation record and convert
    // it to a domain `Observation`, then build each trace on its own.
    // Routing history is an opaque string; its transcript expectation is deferred.
    it.skipIf(fixture === orderSupportRoutingFixture)(
      "returns the expected transcript for every trace",
      () => {
        const observations = fixture.observations.map((observation) =>
          convertObservation(createObservation(observation)),
        );
        const transcript = assembleTranscriptPerTrace(observations);

        console.log("----------Formatted Transcript-------------------");
        console.log(
          formatTranscript(fixture.name, transcript, observations, {
            hideReasoning: true,
          }),
        );
        console.log("-------------------------------------------------");

        expect(transcript).toEqual(fixture.expected);
      },
    );
  });
});
