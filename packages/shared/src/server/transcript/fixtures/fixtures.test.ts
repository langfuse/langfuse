import { describe, expect, it, vi } from "vitest";
import { transcriptFixtures } from "./index";
import { createObservation } from "../../test-utils";
import { convertObservation } from "../../repositories/observations_converters";
import { orderObservations } from "../ordering";
import { assembleTranscript } from "../transcript";
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

  it("caps serialized JSON after assembly, including escaping, without mutating observations", () => {
    const observations = [
      generation("1", ["ORIGINAL_REQUEST"], ['\\"\n🙂'.repeat(4_000)]),
      generation("2", ["LATEST_REQUEST"], ["FINAL_RESPONSE"]),
    ];
    const before = structuredClone(observations);
    const unlimited = assembleTranscript(observations)!;
    const exactLimit = JSON.stringify(unlimited).length;
    expect(
      assembleTranscript(observations, { maxCharacters: exactLimit }),
    ).toEqual(unlimited);
    const timings = vi.fn();
    const capped = assembleTranscript(observations, {
      maxCharacters: 1_000,
      onTimings: timings,
    });
    const json = JSON.stringify(capped);
    expect(json.length).toBeLessThanOrEqual(1_000);
    expect(capped).toMatchObject({ truncated: true });
    expect(json).toContain("ORIGINAL_REQUEST");
    expect(json).toContain("FINAL_RESPONSE");
    expect(timings).toHaveBeenCalledExactlyOnceWith({
      normalizationMs: expect.any(Number),
      matchingMs: expect.any(Number),
    });
    expect(observations).toEqual(before);
    expect(
      JSON.stringify(
        assembleTranscript(observations, { maxCharacters: exactLimit - 1 }),
      ).length,
    ).toBeLessThan(exactLimit);
  });

  it("drops indivisible oversized messages and prunes their contributor references", () => {
    const observations = [
      generation("1", [], ["small"]),
      {
        ...generation("2", [], ["oversized provenance"]),
        id: "id".repeat(2_000),
      },
      {
        ...generation("3", [], []),
        output: { payload: Array.from({ length: 2_000 }, (_, index) => index) },
      },
      generation("4", [], ["last"]),
    ];
    const capped = assembleTranscript(observations, { maxCharacters: 700 });
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(700);
    expect(JSON.stringify(capped)).toContain("small");
    expect(JSON.stringify(capped)).toContain("last");
    expect(
      capped?.threads
        .flatMap((thread) => thread.currentTurn.observations)
        .map(({ id }) => id),
    ).toEqual(["1", "4"]);
    expect(assembleTranscript(observations, { maxCharacters: 4 })).toBeNull();
  });

  it("bounds many threads and rejects impossible character limits", () => {
    const observations = Array.from({ length: 100 }, (_, index) => ({
      ...generation("1", [`Request ${index}`], [`Answer ${index}`]),
      id: `observation-${index}`,
    }));
    const capped = assembleTranscript(observations, { maxCharacters: 1_000 });
    expect(capped?.truncated).toBe(true);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(1_000);
    expect(JSON.stringify(capped)).toContain("Request 0");
    expect(JSON.stringify(capped)).toContain("Answer 99");
    for (const maxCharacters of [
      0,
      3,
      -1,
      4.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => assembleTranscript([], { maxCharacters })).toThrow(
        "maxCharacters",
      );
    }
    expect(assembleTranscript([], { maxCharacters: 4 })).toBeNull();
  });

  it("keeps reasoning with AI SDK provider signatures intact when capping", () => {
    for (const field of ["providerMetadata", "providerOptions"]) {
      const observation = {
        ...generation("1", [], []),
        output: {
          content: [
            {
              type: "reasoning",
              text: "Signed reasoning".repeat(1_000),
              [field]: { anthropic: { signature: "signature-sentinel" } },
            },
          ],
        },
      };
      const full = assembleTranscript([observation]);
      expect(full?.threads[0].currentTurn.messages[0].parts).toMatchObject([
        {
          type: "reasoning",
          content: { kind: "text" },
          providerMetadata: expect.any(Object),
        },
      ]);
      expect(JSON.stringify(full)).toContain("signature-sentinel");
      expect(
        assembleTranscript([observation], { maxCharacters: 600 }),
      ).toBeNull();
    }
  });

  it.each(transcriptFixtures)("$name", (fixture) => {
    const observations = fixture.observations.map((observation) =>
      convertObservation(createObservation(observation)),
    );
    expect(assembleTranscript(orderObservations(observations))).toEqual(
      fixture.expected,
    );
  });
});
