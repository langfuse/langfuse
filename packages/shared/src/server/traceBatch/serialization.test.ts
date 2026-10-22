import { describe, expect, it } from "vitest";
import { transcriptFixtures } from "../transcript/fixtures";
import { createObservation } from "../test-utils";
import { convertObservation } from "../repositories/observations_converters";
import { orderObservations } from "../transcript/ordering";
import { assembleTranscript } from "../transcript/transcript";
import { toStoredTranscriptV1, fromStoredTranscriptV1 } from "./serialization";
import { traceBatchInputsV1Schema } from "./versions/v1";

describe("trace batch input serialization", () => {
  it.each(transcriptFixtures)("round trips $name", (fixture) => {
    const observations = fixture.observations.map((observation) =>
      convertObservation(createObservation(observation)),
    );
    const transcript = assembleTranscript(orderObservations(observations));
    const stored = JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        transcript:
          transcript === null ? null : toStoredTranscriptV1(transcript),
        traceContext: {
          sessionId: null,
          traceName: null,
          traceTimestamp: "2026-10-20T10:00:00.123Z",
          environment: "production",
        },
      }),
    );
    const parsed = traceBatchInputsV1Schema.parse(stored);

    expect(
      parsed.transcript === null
        ? null
        : fromStoredTranscriptV1(parsed.transcript),
    ).toEqual(transcript);
  });
});
