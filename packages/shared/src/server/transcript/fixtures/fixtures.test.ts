import { describe, expect, it } from "vitest";
import { transcriptFixtures } from "./index";
import { createObservation } from "../../test-utils";
import { convertObservation } from "../../repositories/observations_converters";
import { getTranscript } from "../index";
import { formatTranscript } from "./format-transcript";

/**
 * Structural checks on the fixtures themselves, plus the behavior assertion
 * against the transcript builder. Every fixture's transcript is printed
 * (visible with `--disableConsoleIntercept`) so expectations can be authored
 * from real output; the assertion only runs once `expected` is defined.
 */
describe("transcript fixtures", () => {
  const generation = (id: string, input: string[], output: string[]) =>
    convertObservation(
      createObservation({
        id,
        trace_id: `trace-${id}`,
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
    expect(getTranscript([empty])).toBeNull();
    const transcript = getTranscript([empty, generation("2", ["A"], [])]);
    expect(transcript?.threads).toHaveLength(1);
    expect(transcript?.threads[0].observations).toEqual([
      { id: "2", traceId: "trace-2" },
    ]);
  });

  it("continues the newest matching thread without duplicating history", () => {
    const transcript = getTranscript([
      generation("1", ["A"], []),
      generation("2", ["B"], []),
      generation("3", ["B", "A"], ["C"]),
    ]);
    expect(transcript?.threads.map((thread) => thread.observations)).toEqual([
      [{ id: "1", traceId: "trace-1" }],
      [
        { id: "2", traceId: "trace-2" },
        { id: "3", traceId: "trace-3" },
      ],
    ]);
    expect(
      transcript?.threads[1].messages.map((message) => message.observationId),
    ).toEqual(["2", "3", "3"]);
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
    // it to a domain `Observation`, then build the transcript.
    it("returns the expected transcript", () => {
      const observations = fixture.observations.map((observation) =>
        convertObservation(createObservation(observation)),
      );
      const transcript = getTranscript(observations);

      // console.log("----------Transcript-------------------");
      // console.log(JSON.stringify(transcript, null, 2));
      console.log("----------Formatted Transcript-------------------");
      console.log(
        formatTranscript(fixture.name, transcript, observations, {
          hideReasoning: true,
        }),
      );
      console.log("-------------------------------------------------");

      if (fixture.expected === undefined) return;
      expect(transcript).toEqual(fixture.expected);
    });
  });
});
