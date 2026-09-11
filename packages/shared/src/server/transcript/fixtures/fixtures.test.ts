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
      const transcript = getTranscript(observations, fixture.config);

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
