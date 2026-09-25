import { describe, expect, it } from "vitest";
import { convertObservation } from "../repositories/observations_converters";
import { createObservation } from "../test-utils";
import { inheritedConversationHistoryFixture } from "./fixtures/trace/inherited-conversation-history";
import { standaloneToolObservationFixture } from "./fixtures/trace/standalone-tool-observation";
import { orderObservations } from "./ordering";
import { renderTranscript, renderTranscriptFromObservations } from "./render";
import { topicsTranscriptConfig } from "./render-config";
import { assembleTranscript } from "./transcript";
import type { Transcript } from "./types";

const observation = (
  id: string,
  type: "SPAN" | "GENERATION" | "TOOL",
  second: number,
) => ({
  ...convertObservation(createObservation({})),
  id,
  traceId: "trace",
  projectId: "project",
  type,
  name: id,
  parentObservationId: type === "SPAN" ? null : "root",
  startTime: new Date(`2026-01-01T00:00:${String(second).padStart(2, "0")}Z`),
  input: null,
  output: null,
});

describe("Topics transcript renderer", () => {
  it("renders an existing assembly identically to the observations-only path", () => {
    const observations = inheritedConversationHistoryFixture.observations.map(
      (observation) => convertObservation(createObservation(observation)),
    );
    const assembled = assembleTranscript(orderObservations(observations));
    const result = renderTranscript(
      assembled,
      observations,
      topicsTranscriptConfig,
    );

    expect(result).toEqual(
      renderTranscriptFromObservations(observations, topicsTranscriptConfig),
    );
    expect(result.text).toBe(
      [
        "<run_facts>",
        "threads: 1 · rendered user entries: 1 · rendered tool calls: 0 · error signals: 0 · omitted lines: 0",
        "</run_facts>",
        '<earlier_conversation source="replayed input">',
        "[user] Initial request",
        "[assistant] First response",
        "</earlier_conversation>",
        "<this_run>",
        "[run input] Initial request First response Follow-up request",
        "[user · request] Follow-up request",
        "[assistant] Second response",
        "[run output] Second response",
        "</this_run>",
        "<end_of_run>",
        "last action: assistant text",
        "</end_of_run>",
      ].join("\n"),
    );
    expect(result.stats.historyCharacters).toBeGreaterThan(0);
    expect(result.stats.currentTurnCharacters).toBeGreaterThan(0);
    expect(result.tokens).toBeNull();

    const reversedObservations = standaloneToolObservationFixture.observations
      .map((observation) => convertObservation(createObservation(observation)))
      .reverse();
    const ordered = orderObservations(reversedObservations);
    expect(
      renderTranscriptFromObservations(
        reversedObservations,
        topicsTranscriptConfig,
      ),
    ).toEqual(
      renderTranscript(
        assembleTranscript(ordered),
        ordered,
        topicsTranscriptConfig,
      ),
    );
  });

  it("counts characters before and after the Topics block cap", () => {
    const userText = "x".repeat(2200);
    const observations = [
      convertObservation(
        createObservation({
          type: "GENERATION",
          input: JSON.stringify([{ role: "user", content: userText }]),
          output: JSON.stringify({ role: "assistant", content: "Done" }),
        }),
      ),
    ];
    const result = renderTranscript(
      assembleTranscript(orderObservations(observations)),
      observations,
      topicsTranscriptConfig,
    );

    expect(result.stats.blockCharacters.user.raw).toBe(userText.length);
    expect(result.stats.blockCharacters.user.clipped).toBeLessThan(
      userText.length,
    );
    expect(result.stats.blocksCut).toBe(1);
    expect(result.stats.messagesOmitted).toBe(0);
    expect(result.text).toContain("[200 chars omitted]");
    expect(result.text).toContain("[assistant] Done");
  });

  it("keeps trace I/O outside chronological threads and labels replayed input", () => {
    const root = {
      ...observation("root", "SPAN", 0),
      input: "Task",
      output: "Published",
    };
    const first = observation("first", "GENERATION", 1);
    const second = {
      ...observation("second", "GENERATION", 2),
      level: "WARNING" as const,
      statusMessage: "retry",
    };
    const transcript: Transcript = {
      threads: [
        {
          conversationHistory: [],
          currentTurn: {
            messages: [
              {
                role: "user",
                source: "input",
                parts: [{ type: "text", text: "Task" }],
                observationId: first.id,
                traceId: "trace",
              },
              {
                role: "assistant",
                source: "output",
                parts: [{ type: "text", text: "Draft" }],
                observationId: first.id,
                traceId: "trace",
              },
            ],
            observations: [{ id: first.id, traceId: "trace" }],
          },
        },
        {
          conversationHistory: [
            {
              role: "user",
              source: "input",
              parts: [{ type: "text", text: "Replayed context" }],
            },
          ],
          currentTurn: {
            messages: [
              {
                role: "assistant",
                source: "output",
                parts: [{ type: "text", text: "Second" }],
                observationId: second.id,
                traceId: "trace",
              },
            ],
            observations: [{ id: second.id, traceId: "trace" }],
          },
        },
      ],
    };
    const text = renderTranscript(
      transcript,
      [root, first, second],
      topicsTranscriptConfig,
    ).text;

    expect(text).toContain(
      '<earlier_conversation source="replayed input">\n<thread n="2">\n[user] Replayed context\n</thread>\n</earlier_conversation>',
    );
    expect(text).toContain(
      '<this_run>\n[run input] Task\n<thread n="1">\n[user · request] Task\n[assistant] Draft\n</thread>\n<thread n="2">\n[assistant] Second\n[warning GENERATION second] retry\n</thread>\n[run output] Published\n</this_run>',
    );
    expect(text.indexOf("<run_facts>")).toBeLessThan(
      text.indexOf("<earlier_conversation"),
    );
    expect(text.indexOf("<earlier_conversation")).toBeLessThan(
      text.indexOf("<this_run>"),
    );
    expect(text.indexOf("<this_run>")).toBeLessThan(
      text.indexOf("<end_of_run>"),
    );
    expect(text).toContain(
      "last action: assistant text\nrun output differs from last assistant text",
    );
  });

  it("shows trace I/O for a pipeline without a user and notes only a distinct output", () => {
    const root = {
      ...observation("root", "SPAN", 0),
      input: "Timer fired",
      output: "Final report",
    };
    const generation = observation("generation", "GENERATION", 1);
    const transcript: Transcript = {
      threads: [
        {
          conversationHistory: [],
          currentTurn: {
            messages: [
              {
                role: "system",
                source: "input",
                parts: [{ type: "text", text: "Summarize the data" }],
                observationId: generation.id,
                traceId: "trace",
              },
              {
                role: "assistant",
                source: "output",
                parts: [{ type: "text", text: "Draft" }],
                observationId: generation.id,
                traceId: "trace",
              },
            ],
            observations: [{ id: generation.id, traceId: "trace" }],
          },
        },
      ],
    };

    const distinct = renderTranscript(
      transcript,
      [root, generation],
      topicsTranscriptConfig,
    ).text;
    expect(distinct).toContain("[run input] Timer fired");
    expect(distinct).toContain("[run output] Final report");
    expect(distinct).not.toContain("[user · request]");
    expect(distinct).toContain("run output differs from last assistant text");

    const matching = renderTranscript(
      transcript,
      [{ ...root, output: "Draft" }, generation],
      topicsTranscriptConfig,
    ).text;
    expect(matching).toContain("[run output] Draft");
    expect(matching).not.toContain(
      "run output differs from last assistant text",
    );
  });

  it("numbers a failing tool pair, places its error inline, and distinguishes a pending call", () => {
    const root = { ...observation("root", "SPAN", 0), input: "Search" };
    const generation = observation("generation", "GENERATION", 1);
    const tool = {
      ...observation("tool", "TOOL", 2),
      name: "search",
      level: "ERROR" as const,
      statusMessage: "timeout",
    };
    const messages: Transcript["threads"][number]["currentTurn"]["messages"] = [
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "Search" }],
        observationId: generation.id,
        traceId: "trace",
      },
      {
        role: "assistant",
        source: "output",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "search",
            input: { query: "x" },
          },
        ],
        observationId: generation.id,
        traceId: "trace",
      },
      {
        role: "tool",
        source: "output",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "search",
            output: "timeout",
            isError: true,
          },
        ],
        observationId: tool.id,
        traceId: "trace",
      },
    ];
    const transcript: Transcript = {
      threads: [
        {
          conversationHistory: [],
          currentTurn: {
            messages,
            observations: [
              { id: generation.id, traceId: "trace" },
              { id: tool.id, traceId: "trace" },
            ],
          },
        },
      ],
    };

    const failed = renderTranscript(
      transcript,
      [root, generation, tool],
      topicsTranscriptConfig,
    ).text;
    expect(failed).toContain(
      '[assistant → search #1] {"query":"x"}\n[tool search #1 ← ERROR] timeout\n[error TOOL search] timeout',
    );
    expect(failed).toContain("last action: tool result");

    const pending: Transcript = {
      threads: [
        {
          conversationHistory: [],
          currentTurn: {
            messages: messages.slice(0, 2),
            observations: [{ id: generation.id, traceId: "trace" }],
          },
        },
      ],
    };
    expect(
      renderTranscript(pending, [root, generation], topicsTranscriptConfig)
        .text,
    ).toContain("last action: assistant tool call");
  });
});
