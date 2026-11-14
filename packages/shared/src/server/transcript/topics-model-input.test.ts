import { expect, it } from "vitest";
import type { ExecutionIssue, Transcript } from "./types";
import {
  prepareAssembledTopicTranscript,
  renderStoredTopicText,
} from "./topics-model-input";

it("keeps canonical conversation evidence without provenance or opaque payloads", () => {
  const answer = "Useful answer. ".repeat(1_000);
  const transcript: Transcript = {
    threads: [
      {
        conversationHistory: [
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Earlier question" }],
          },
        ],
        currentTurn: {
          nestingLevel: 0,
          observations: [
            { id: "private-observation", traceId: "private-trace" },
          ],
          messages: [
            {
              id: "private-message",
              observationId: "private-observation",
              traceId: "private-trace",
              startTime: new Date("2026-01-01T00:00:00.000Z"),
              endTime: new Date("2026-01-01T00:00:01.000Z"),
              role: "assistant",
              source: "output",
              parts: [
                { type: "text", text: answer },
                {
                  type: "reasoning",
                  content: { kind: "text", text: "private-reasoning" },
                },
                {
                  type: "file",
                  mediaType: "audio/wav",
                  content: { kind: "base64", data: "private-media" },
                  providerMetadata: { transcript: "Spoken answer" },
                },
                {
                  type: "tool-call",
                  toolCallId: "private-call",
                  toolName: "search",
                  input: { query: "Refund policy", limit: 2 },
                  providerMetadata: { toolDefinitions: "private-schema" },
                },
                {
                  type: "tool-result",
                  toolCallId: "private-call",
                  toolName: "search",
                  output: {
                    type: "json",
                    value: {
                      result: "Refunds allowed",
                      thinking: "private-thinking",
                      image: "data:image/png;base64,SElEREVO",
                    },
                  },
                },
                { type: "data", value: { count: 2 } },
              ],
            },
          ],
        },
      },
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 0,
          observations: [],
          messages: [
            {
              observationId: "other-observation",
              traceId: "private-trace",
              startTime: new Date("2026-01-01T00:00:02.000Z"),
              endTime: null,
              role: "user",
              source: "input",
              parts: [{ type: "text", text: "Independent question" }],
            },
          ],
        },
      },
    ],
  };
  const prepared = prepareAssembledTopicTranscript(transcript);
  expect(prepared.hasContent).toBe(true);
  const parsed = JSON.parse(prepared.text);
  expect(parsed.threads).toHaveLength(2);
  expect(parsed.threads[0].conversationHistory[0].parts[0].text).toBe(
    "Earlier question",
  );
  expect(parsed.threads[0].currentTurn[0].parts).toEqual([
    { type: "text", text: answer },
    {
      type: "file",
      mediaType: "audio/wav",
      content: "[media omitted]",
      transcript: "Spoken answer",
    },
    {
      type: "tool-call",
      toolName: "search",
      input: { query: "Refund policy", limit: 2 },
    },
    {
      type: "tool-result",
      toolName: "search",
      output: { result: "Refunds allowed", image: "[media omitted]" },
    },
    { type: "data", value: { count: 2 } },
  ]);
  expect(prepared.text).not.toMatch(/private-|SElEREVO|toolDefinitions/);
  expect(prepareAssembledTopicTranscript(null).hasContent).toBe(false);
});

it("renders a stored transcript with its execution issues as Topics text", () => {
  const at = (second: number) => new Date(`2026-01-01T00:00:0${second}.000Z`);
  const transcript: Transcript = {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 0,
          observations: [
            { id: "generation", traceId: "trace" },
            { id: "tool", traceId: "trace" },
          ],
          messages: [
            {
              id: "user",
              observationId: "generation",
              traceId: "trace",
              startTime: at(0),
              endTime: at(1),
              role: "user",
              source: "input",
              parts: [{ type: "text", text: "Run the tests" }],
            },
            {
              id: "call",
              observationId: "generation",
              traceId: "trace",
              startTime: at(1),
              endTime: at(2),
              role: "assistant",
              source: "output",
              parts: [
                {
                  type: "tool-call",
                  toolCallId: "call-1",
                  toolName: "bash",
                  input: { command: "pytest" },
                },
              ],
            },
            {
              id: "result",
              observationId: "tool",
              traceId: "trace",
              startTime: at(2),
              endTime: at(3),
              role: "tool",
              source: "output",
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "call-1",
                  toolName: "bash",
                  output: {
                    type: "text",
                    value: "def f():\n    return 1\nFAILED",
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
  const executionIssues: ExecutionIssue[] = [
    {
      observationId: "tool",
      traceId: "trace",
      type: "TOOL",
      name: "bash",
      level: "ERROR",
      statusMessage: "exit code 1",
      startTime: at(2),
    },
  ];

  const text = renderStoredTopicText(transcript, executionIssues);

  expect(text).toContain("Run the tests");
  expect(text).toContain("[error TOOL bash] exit code 1");
  expect(text).toContain("def f():\n    return 1");
});

it("places an issue without a message at its moment across overlapping threads", () => {
  const at = (second: number) =>
    new Date(`2026-01-01T00:00:${String(second).padStart(2, "0")}.000Z`);
  const message = (id: string, second: number, text: string) => ({
    id,
    observationId: id,
    traceId: "trace",
    startTime: at(second),
    endTime: at(second),
    role: "assistant" as const,
    source: "output" as const,
    parts: [{ type: "text" as const, text }],
  });
  const thread = (...messages: ReturnType<typeof message>[]) => ({
    conversationHistory: [],
    currentTurn: {
      nestingLevel: 0,
      observations: messages.map(({ id }) => ({ id, traceId: "trace" })),
      messages,
    },
  });
  // The orchestrator runs on past the subagent's failed step.
  const transcript: Transcript = {
    threads: [
      thread(message("o1", 0, "Plan"), message("o2", 50, "Wrap up")),
      thread(message("s1", 20, "Search"), message("s2", 40, "Retry")),
    ],
  };

  const text = renderStoredTopicText(transcript, [
    {
      observationId: "span",
      traceId: "trace",
      type: "SPAN",
      name: "fetch",
      level: "ERROR",
      statusMessage: "timeout",
      startTime: at(30),
    },
  ]);

  const error = text.indexOf("[error SPAN fetch] timeout");
  expect(error).toBeGreaterThan(text.indexOf("Search"));
  expect(error).toBeLessThan(text.indexOf("Retry"));
});
