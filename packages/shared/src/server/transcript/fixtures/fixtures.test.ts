import { describe, expect, it, vi } from "vitest";
import { transcriptFixtures } from "./index";
import { createObservation } from "../../test-utils";
import { convertObservation } from "../../repositories/observations_converters";
import { orderObservations } from "../ordering";
import { assembleTranscript } from "../transcript";
describe("transcript fixtures", () => {
  const traceId = "trace";
  const generation = (id: string, input: string[], output: string[]) => ({
    ...convertObservation(
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
    ),
    nestingLevel: 0,
  });

  it("skips generations without messages", () => {
    const empty = generation("1", [], []);
    expect(assembleTranscript([empty])).toBeNull();
    const transcript = assembleTranscript([empty, generation("2", ["A"], [])]);
    expect(transcript?.threads).toHaveLength(1);
    expect(transcript?.threads[0].currentTurn.observations).toEqual([
      { id: "2", traceId },
    ]);
  });

  it("preserves an unfinished generation's null end time", () => {
    const observation = generation("1", ["A"], ["B"]);
    observation.endTime = null;
    const transcript = assembleTranscript([observation]);

    expect(transcript?.threads[0].currentTurn.messages).toHaveLength(2);
    for (const message of transcript!.threads[0].currentTurn.messages) {
      expect(message.startTime).toEqual(observation.startTime);
      expect(message.endTime).toBeNull();
    }
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
      {
        ...generation("1", ["ORIGINAL_REQUEST"], ['\\"\n🙂'.repeat(4_000)]),
        nestingLevel: 2,
      },
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
    expect(capped?.threads[0].currentTurn.nestingLevel).toBe(2);
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

  it("continues and deduplicates tool calls replayed with provider metadata and a raw tool type", () => {
    const input = { providerMetadata: "argument", toolType: "argument" };
    const first = {
      ...generation("1", ["A"], []),
      output: {
        tool_calls: [{ toolCallId: "call", toolName: "lookup", args: input }],
      },
    };
    const replay = {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call",
          toolName: "lookup",
          input,
          providerOptions: { mastra: { modelOutput: "provider details" } },
        },
      ],
    };
    const second = {
      ...generation("2", [], []),
      input: [{ role: "user", content: "A" }, replay],
      output: { role: "assistant", content: "Done" },
    };
    const transcript = assembleTranscript([first, second]);
    expect(transcript?.threads).toHaveLength(1);
    expect(transcript?.threads[0].currentTurn.messages).toHaveLength(3);
    expect(transcript?.threads[0].currentTurn.observations).toEqual([
      { id: "1", traceId },
      { id: "2", traceId },
    ]);

    // Metadata remains available when this is the first recorded occurrence.
    const standalone = assembleTranscript([second]);
    expect(
      standalone?.threads[0].conversationHistory[1].parts[0],
    ).toMatchObject({
      toolType: "tool-call",
      providerMetadata: { mastra: { modelOutput: "provider details" } },
      input,
    });

    // These field names can also be real tool arguments and must still match.
    for (const field of ["providerMetadata", "toolType"]) {
      const changed = {
        ...second,
        input: [
          second.input[0],
          {
            ...replay,
            content: [
              { ...replay.content[0], input: { ...input, [field]: "changed" } },
            ],
          },
        ],
      };
      expect(assembleTranscript([first, changed])?.threads).toHaveLength(2);
    }
  });

  it("uses the first current-turn generation depth, excluding history and later generations", () => {
    const previous = {
      ...generation("1", ["A"], []),
      traceId: "previous-trace",
      startTime: new Date("2025-12-31T12:00:00Z"),
      output: [{ role: "assistant", content: "B" }],
    };
    const first = {
      ...generation("2", [], []),
      parentObservationId: "agent",
      input: [
        { role: "user", content: "A" },
        { role: "assistant", content: "B" },
        { role: "user", content: "C" },
      ],
      output: [{ role: "assistant", content: "D" }],
    };
    const later = {
      ...generation("3", [], []),
      parentObservationId: "root",
      input: [...first.input, ...first.output],
      output: [{ role: "assistant", content: "E" }],
    };
    const root = {
      ...generation("0", [], []),
      id: "root",
      type: "SPAN" as const,
      parentObservationId: null,
    };
    const agent = {
      ...root,
      id: "agent",
      type: "AGENT" as const,
      parentObservationId: "root",
    };
    const transcript = assembleTranscript(
      orderObservations([previous, root, agent, first, later]),
    );
    expect(transcript?.threads).toHaveLength(1);
    expect(transcript?.threads[0].currentTurn.nestingLevel).toBe(2);
    expect(
      transcript?.threads[0].currentTurn.observations.map(({ id }) => id),
    ).toEqual(["2", "3"]);
    expect(transcript?.threads[0].conversationHistory).toHaveLength(2);
  });

  it("continues when replay omits reasoning, without losing the original output", () => {
    const first = {
      ...generation("1", ["A"], []),
      output: {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Consider the choices." },
          { type: "text", text: "B" },
        ],
      },
    };
    const second = {
      ...generation("2", [], []),
      input: [
        { role: "user", content: "A" },
        { role: "assistant", content: "B" },
      ],
    };
    const transcript = assembleTranscript([first, second]);
    expect(transcript?.threads).toHaveLength(1);
    expect(transcript?.threads[0].currentTurn.messages).toHaveLength(2);
    expect(transcript?.threads[0].currentTurn.messages[1]).toMatchObject({
      observationId: "1",
      source: "output",
      parts: [
        {
          type: "reasoning",
          content: { kind: "text", text: "Consider the choices." },
        },
        { type: "text", text: "B" },
      ],
    });
  });

  it("does not establish continuity from system messages and reasoning alone", () => {
    const system = { role: "system", content: "Think carefully." };
    const reasoning = {
      role: "assistant",
      content: [{ type: "reasoning", text: "Consider the choices." }],
    };
    const first = {
      ...generation("1", [], []),
      input: [system],
      output: reasoning,
    };
    const second = {
      ...generation("2", [], ["B"]),
      input: [system, reasoning],
    };
    expect(assembleTranscript([first, second])?.threads).toHaveLength(2);
  });

  it("retains a changed reasoning group in full and deduplicates its later replay", () => {
    const reasoning = { type: "reasoning", text: "Consider the choices." };
    const first = {
      ...generation("1", ["A"], []),
      output: {
        role: "assistant",
        content: [reasoning, { type: "text", text: "B" }],
      },
    };
    const second = {
      ...generation("2", [], []),
      input: [
        { role: "user", content: "A" },
        { role: "assistant", content: [reasoning, reasoning] },
        { role: "assistant", content: "B" },
      ],
    };
    const third = { ...second, id: "3" };
    const transcript = assembleTranscript([first, second, third]);
    expect(transcript?.threads).toHaveLength(1);
    const messages = transcript!.threads[0].currentTurn.messages;
    expect(messages).toHaveLength(3);
    expect(
      messages
        .flatMap(({ parts }) => parts)
        .filter(({ type }) => type === "reasoning"),
    ).toHaveLength(3);
    expect(messages[2]).toMatchObject({ observationId: "2", source: "input" });
    expect(transcript?.threads[0].currentTurn.observations).toEqual([
      { id: "1", traceId },
      { id: "2", traceId },
    ]);
  });

  it("keeps changed assistant text in a separate thread despite matching reasoning", () => {
    const reasoning = { type: "reasoning", text: "Consider the choices." };
    const first = {
      ...generation("1", ["A"], []),
      output: {
        role: "assistant",
        content: [reasoning, { type: "text", text: "B" }],
      },
    };
    const second = {
      ...generation("2", [], []),
      input: [
        { role: "user", content: "A" },
        {
          role: "assistant",
          content: [reasoning, { type: "text", text: "Different answer" }],
        },
      ],
    };
    expect(assembleTranscript([first, second])?.threads).toHaveLength(2);
  });

  it("retains changed reasoning in cross-trace history and uses the new turn's depth", () => {
    const first = {
      ...generation("1", ["A"], []),
      nestingLevel: 2,
      output: {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Original reasoning." },
          { type: "text", text: "B" },
        ],
      },
    };
    const second = {
      ...generation("2", [], []),
      traceId: "next-trace",
      nestingLevel: 4,
      input: [
        { role: "user", content: "A" },
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "Revised reasoning." },
            { type: "text", text: "B" },
          ],
        },
        { role: "user", content: "C" },
      ],
      output: { role: "assistant", content: "D" },
    };
    const transcript = assembleTranscript([first, second]);
    expect(transcript?.threads).toHaveLength(1);
    const thread = transcript!.threads[0];
    expect(thread.conversationHistory.flatMap(({ parts }) => parts)).toEqual([
      { type: "text", text: "A" },
      {
        type: "reasoning",
        content: { kind: "text", text: "Original reasoning." },
      },
      { type: "text", text: "B" },
      {
        type: "reasoning",
        content: { kind: "text", text: "Revised reasoning." },
      },
    ]);
    for (const message of thread.conversationHistory) {
      expect(message).not.toHaveProperty("observationId");
    }
    expect(thread.currentTurn.nestingLevel).toBe(4);
    expect(thread.currentTurn.messages.map(({ parts }) => parts)).toEqual([
      [{ type: "text", text: "C" }],
      [{ type: "text", text: "D" }],
    ]);
    expect(thread.currentTurn.observations).toEqual([
      { id: "2", traceId: "next-trace" },
    ]);
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
    const snapshot = structuredClone(observations);
    expect(assembleTranscript(orderObservations(observations))).toEqual(
      fixture.expected,
    );
    expect(observations).toEqual(snapshot);
  });
});
