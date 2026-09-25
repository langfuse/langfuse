import { describe, expect, it } from "vitest";
import { convertObservation } from "../repositories/observations_converters";
import { createObservation } from "../test-utils";
import { inheritedConversationHistoryFixture } from "./fixtures/trace/inherited-conversation-history";
import { standaloneToolObservationFixture } from "./fixtures/trace/standalone-tool-observation";
import { orderObservations } from "./ordering";
import {
  renderTranscript,
  renderTranscriptFromObservations,
} from "./topics-renderer";
import { topicsTranscriptConfig } from "./topics-renderer-config";
import { assembleTranscript } from "./transcript";
import type { Transcript } from "./types";

const observation = (
  id: string,
  type: "SPAN" | "AGENT" | "GENERATION" | "TOOL",
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
        "[generation] Session turn 2",
        "[user · request] Follow-up request",
        "[assistant · final output] Second response",
        "</this_run>",
        "<end_of_run>",
        "last action: assistant text",
        "final output: assistant",
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
    expect(result.text).toContain("[assistant · final output] Done");
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
    expect(text).toContain("[user · request] Task");
    expect(text).not.toContain("[input · request] Task");
    expect(text).toContain("[generation] first");
    expect(text).toContain("[generation] second");
    expect(text).toContain("[warning GENERATION second] retry");
    expect(text).toContain("[final output] Published");
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
      "last action: assistant text\nfinal output: application output",
    );
  });

  it("shows trace I/O for a pipeline without a user and notes only a distinct output", () => {
    const root = {
      ...observation("root", "SPAN", 0),
      parentObservationId: "",
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
    expect(distinct).toContain("[input · request] Timer fired");
    expect(distinct).toContain("[final output] Final report");
    expect(distinct).not.toContain("[user · request]");
    expect(distinct).toContain("final output: application output");

    const matching = renderTranscript(
      transcript,
      [{ ...root, output: "Draft" }, generation],
      topicsTranscriptConfig,
    ).text;
    expect(matching).toContain("[assistant · final output] Draft");
    expect(matching).not.toContain("[final output] Draft");
    expect(matching).toContain("final output: assistant");
  });

  it("keeps an unassigned operation marker inside the active thread", () => {
    const first = observation("first", "GENERATION", 1);
    const marker = observation("validate", "SPAN", 2);
    const second = observation("second", "GENERATION", 3);
    const other = observation("other", "GENERATION", 4);
    const message = (observationId: string, value: string) => ({
      role: "assistant" as const,
      source: "output" as const,
      parts: [{ type: "text" as const, text: value }],
      observationId,
      traceId: "trace",
    });
    const transcript: Transcript = {
      threads: [
        {
          conversationHistory: [],
          currentTurn: {
            messages: [
              message(first.id, "First"),
              message(second.id, "Second"),
            ],
            observations: [first, second].map(({ id }) => ({
              id,
              traceId: "trace",
            })),
          },
        },
        {
          conversationHistory: [],
          currentTurn: {
            messages: [message(other.id, "Other")],
            observations: [{ id: other.id, traceId: "trace" }],
          },
        },
      ],
    };

    const text = renderTranscript(
      transcript,
      [first, marker, second, other],
      topicsTranscriptConfig,
    ).text;
    expect(text).toContain(
      "[assistant] First\n[span] validate\n[generation] second",
    );
    expect(text.match(/<thread n="1">/g)).toHaveLength(1);
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

  it("marks the request after supplied context without repeating trace input", () => {
    const root = {
      ...observation("root", "SPAN", 0),
      input: "System instructions",
      output: "Done",
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
                parts: [{ type: "text", text: "System instructions" }],
                observationId: generation.id,
                traceId: "trace",
              },
              {
                role: "user",
                source: "input",
                parts: [{ type: "text", text: "Project data" }],
                observationId: generation.id,
                traceId: "trace",
              },
              {
                role: "user",
                source: "input",
                parts: [{ type: "text", text: "Find the errors" }],
                observationId: generation.id,
                traceId: "trace",
              },
              {
                role: "assistant",
                source: "output",
                parts: [{ type: "text", text: "Done" }],
                observationId: generation.id,
                traceId: "trace",
              },
            ],
            observations: [{ id: generation.id, traceId: "trace" }],
          },
        },
      ],
    };

    const text = renderTranscript(
      transcript,
      [root, generation],
      topicsTranscriptConfig,
    ).text;
    expect(text).toContain(
      "[user] Project data\n[user · request] Find the errors",
    );
    expect(text).not.toContain("[input · request]");
    expect(text).toContain("[assistant · final output] Done");
    expect(text).not.toContain("[final output] Done");
  });

  it("keeps distinct trace input alongside a user request", () => {
    const root = {
      ...observation("root", "SPAN", 0),
      input: "Triggered by a scheduled import",
    };
    const generation = observation("generation", "GENERATION", 1);
    const transcript: Transcript = {
      threads: [
        {
          conversationHistory: [],
          currentTurn: {
            messages: [
              {
                role: "user",
                source: "input",
                parts: [{ type: "text", text: "Summarize the import" }],
                observationId: generation.id,
                traceId: "trace",
              },
              {
                role: "assistant",
                source: "output",
                parts: [{ type: "text", text: "Summary" }],
                observationId: generation.id,
                traceId: "trace",
              },
            ],
            observations: [{ id: generation.id, traceId: "trace" }],
          },
        },
      ],
    };

    const text = renderTranscript(
      transcript,
      [root, generation],
      topicsTranscriptConfig,
    ).text;
    expect(text).toContain(
      "[trace input · context] Triggered by a scheduled import",
    );
    expect(text).toContain("[user · request] Summarize the import");
  });

  it("marks observation kinds and attributes a matching final output to a tool", () => {
    const root = {
      ...observation("root", "SPAN", 0),
      output: "Result",
    };
    const agent = observation("agent", "AGENT", 1);
    const generation = observation("generation", "GENERATION", 2);
    const tool = { ...observation("tool", "TOOL", 3), name: "lookup" };
    const transcript: Transcript = {
      threads: [
        {
          conversationHistory: [],
          currentTurn: {
            messages: [
              {
                role: "assistant",
                source: "output",
                parts: [
                  {
                    type: "tool-call",
                    toolCallId: "call-1",
                    toolName: "lookup",
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
                    toolName: "lookup",
                    output: "Result",
                  },
                ],
                observationId: tool.id,
                traceId: "trace",
              },
            ],
            observations: [
              { id: generation.id, traceId: "trace" },
              { id: tool.id, traceId: "trace" },
            ],
          },
        },
      ],
    };

    const text = renderTranscript(
      transcript,
      [root, agent, generation, tool],
      topicsTranscriptConfig,
    ).text;
    expect(text).toContain(
      "[span] root\n[agent] agent\n[generation] generation",
    );
    expect(text).toContain("[tool lookup #1 ← FINAL OUTPUT] Result");
    expect(text).not.toContain("[tool] lookup");
    expect(text).not.toContain("[final output] Result");
    expect(text).toContain("final output: tool result");
  });

  it("pairs a result with the current call when replayed history reused its ID", () => {
    const generation = observation("generation", "GENERATION", 1);
    const tool = { ...observation("tool", "TOOL", 2), name: "lookup" };
    const call = {
      type: "tool-call" as const,
      toolCallId: "same-id",
      toolName: "lookup",
      input: { query: "x" },
    };
    const transcript: Transcript = {
      threads: [
        {
          conversationHistory: [
            {
              role: "assistant",
              source: "output",
              parts: [call],
            },
          ],
          currentTurn: {
            messages: [
              {
                role: "assistant",
                source: "output",
                parts: [call],
                observationId: generation.id,
                traceId: "trace",
              },
              {
                role: "tool",
                source: "output",
                parts: [
                  {
                    type: "tool-result",
                    toolCallId: "same-id",
                    toolName: "lookup",
                    output: "Found",
                  },
                ],
                observationId: tool.id,
                traceId: "trace",
              },
            ],
            observations: [
              { id: generation.id, traceId: "trace" },
              { id: tool.id, traceId: "trace" },
            ],
          },
        },
      ],
    };

    const text = renderTranscript(
      transcript,
      [generation, tool],
      topicsTranscriptConfig,
    ).text;
    expect(text).toContain('[assistant → lookup #1] {"query":"x"}');
    expect(text).toContain("[tool lookup #1 ←] Found");

    const withoutIds = structuredClone(transcript);
    for (const message of [
      ...withoutIds.threads[0]!.conversationHistory,
      ...withoutIds.threads[0]!.currentTurn.messages,
    ]) {
      for (const part of message.parts) {
        if (part.type === "tool-call" || part.type === "tool-result")
          part.toolCallId = null;
      }
    }
    const withoutIdsText = renderTranscript(
      withoutIds,
      [generation, tool],
      topicsTranscriptConfig,
    ).text;
    expect(withoutIdsText).toContain("[tool lookup #1 ←] Found");
  });
});
