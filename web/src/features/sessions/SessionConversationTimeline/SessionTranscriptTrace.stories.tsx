import preview from "@/.storybook/preview";
import { type ComponentProps } from "react";
import { SessionTranscriptTrace } from "./SessionTranscriptTrace";

type Props = ComponentProps<typeof SessionTranscriptTrace>;
const trace: Props["trace"] = {
  id: "trace-1",
  name: "Weather assistant",
  timestamp: new Date("2026-09-24T12:00:00Z"),
  environment: "default",
  userId: null,
  observationCount: 3,
  latencyMs: 1000,
  scores: [],
};
const provenance = {
  observationId: "generation-1",
  traceId: trace.id,
  startTime: trace.timestamp,
  endTime: new Date("2026-09-24T12:00:01Z"),
};
const result: Props["result"] = {
  state: "loaded",
  cutoff: false,
  transcript: {
    threads: [
      {
        conversationHistory: [
          {
            role: "system",
            source: "input",
            parts: [{ type: "text", text: "Help the user plan their trip." }],
          },
          {
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "I am visiting Berlin." }],
          },
        ],
        currentTurn: {
          observations: [],
          messages: [
            {
              ...provenance,
              role: "user",
              source: "input",
              parts: [{ type: "text", text: "What is the weather?" }],
            },
            {
              ...provenance,
              role: "assistant",
              source: "output",
              parts: [
                { type: "text", text: "Let me check." },
                {
                  type: "tool-call",
                  toolCallId: "weather-1",
                  toolName: "weather",
                  input: { city: "Berlin" },
                },
              ],
            },
            {
              ...provenance,
              role: "tool",
              source: "output",
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "weather-1",
                  toolName: "weather",
                  output: { temperature: 12, conditions: "Sunny" },
                },
              ],
            },
            {
              ...provenance,
              role: "assistant",
              source: "output",
              parts: [
                { type: "text", text: "It is **12°C and sunny** in Berlin." },
              ],
            },
          ],
        },
      },
      {
        conversationHistory: [],
        currentTurn: {
          observations: [],
          messages: [
            {
              ...provenance,
              endTime: null,
              role: "assistant",
              source: "output",
              senderName: "Trip planner",
              parts: [{ type: "text", text: "Looking up outdoor activities…" }],
            },
          ],
        },
      },
    ],
  },
};
const meta = preview.meta({ component: SessionTranscriptTrace });
export default meta;
export const MultipleThreads = meta.story({
  args: { trace, turnNumber: 1, result },
});
export const Cutoff = meta.story({
  args: { trace, turnNumber: 1, result: { ...result, cutoff: true } },
});
export const Loading = meta.story({
  args: { trace, turnNumber: 1, result: { state: "loading" } },
});
export const Error = meta.story({
  args: { trace, turnNumber: 1, result: { state: "error" } },
});
