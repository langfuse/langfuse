import { describe, expect, it } from "vitest";
import { transcriptFixtures } from "./index";
import { createObservation } from "../../test-utils";
import { convertObservation } from "../../repositories/observations_converters";
import { orderObservations } from "../ordering";
import { assembleTranscript } from "../transcript";
import { formatTranscript } from "./format-transcript";

/**
 * Structural checks on fixtures and exact transcript expectations.
 */
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

  it("retains additional reasoning occurrences and deduplicates later standalone replay", () => {
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
    ).toHaveLength(2);
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

    it("belongs to one trace", () => {
      expect(traceIds.size).toBe(1);
    });

    // Complete each seed into a full ClickHouse observation record and convert
    // it to a domain `Observation`, then build the transcript.
    it("returns the expected transcript", () => {
      const observations = fixture.observations.map((observation) =>
        convertObservation(createObservation(observation)),
      );
      const transcript = assembleTranscript(orderObservations(observations));

      console.log("----------Formatted Transcript-------------------");
      console.log(
        formatTranscript(fixture.name, transcript, observations, {
          hideReasoning: true,
        }),
      );
      console.log("-------------------------------------------------");

      expect(transcript).toEqual(fixture.expected);
    });
  });
});
