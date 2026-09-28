import { expect, it } from "vitest";
import type { Transcript } from "@langfuse/shared/src/server";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";

it("keeps canonical conversation evidence and hashes it without provenance or opaque payloads", () => {
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
                    result: "Refunds allowed",
                    thinking: "private-thinking",
                    image: "data:image/png;base64,SElEREVO",
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
  const reordered = structuredClone(transcript);
  const call = reordered.threads[0].currentTurn.messages[0].parts[3];
  if (call.type !== "tool-call") throw new Error("Expected tool call fixture");
  call.input = { limit: 2, query: "Refund policy" };
  reordered.threads[0].currentTurn.messages[0].traceId = "different-trace";
  expect(prepareAssembledTopicTranscript(reordered).inputHash).toBe(
    prepared.inputHash,
  );
  call.input = { query: "Different policy", limit: 2 };
  expect(prepareAssembledTopicTranscript(reordered).inputHash).not.toBe(
    prepared.inputHash,
  );
  expect(prepareAssembledTopicTranscript(null).hasContent).toBe(false);
});
