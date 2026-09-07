// @vitest-environment node

import { describe, expect, it } from "vitest";

import { prepareSessionTimelineObservations } from "@/src/components/session/SessionConversationTimeline/fns/prepareSessionTimelineObservations";

const observation = (
  id: string,
  input: unknown,
  output: unknown,
  type = "GENERATION",
  startTime = new Date(0),
  traceId = "trace-1",
) => ({
  id,
  traceId,
  type,
  startTime,
  input,
  output,
  metadata: null,
  inputTruncated: false,
  outputTruncated: false,
  metadataTruncated: false,
});

describe("prepareSessionTimelineObservations", () => {
  it("reconciles cumulative generation history across session traces", () => {
    const prepared = prepareSessionTimelineObservations(
      [
        observation(
          "generation-1",
          [
            { role: "system", content: "Instructions" },
            { role: "user", content: "User 1" },
          ],
          "Assistant 1",
        ),
        observation(
          "generation-2",
          [
            { role: "system", content: "Instructions" },
            { role: "user", content: "User 1" },
            { role: "assistant", content: "Assistant 1" },
            { role: "user", content: "User 2" },
          ],
          "Assistant 2",
        ),
      ],
      true,
    );

    expect(prepared[1]?.processedMessages.messages).toMatchObject([
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "User 2" }],
      },
      {
        role: "assistant",
        source: "output",
        parts: [{ type: "text", text: "Assistant 2" }],
      },
    ]);
  });

  it("preserves skipped and failed observations in their original positions", () => {
    const invalidInput = Object.defineProperty({}, "messages", {
      get() {
        throw new Error("Cannot parse input");
      },
    });
    const observations = [
      observation("generation-1", [], null),
      observation("tool", null, null, "TOOL"),
      observation("invalid", invalidInput, null),
    ];

    const prepared = prepareSessionTimelineObservations(observations, true);

    expect(prepared).toHaveLength(observations.length);
    expect(prepared.map(({ observation: item }) => item.id)).toEqual([
      "generation-1",
      "tool",
      "invalid",
    ]);
    expect(prepared[1]?.parsed).toBeNull();
    expect(prepared[1]?.processedMessages).toEqual({
      messages: [],
      rolledUpToolCalls: [],
    });
    expect(prepared[2]?.parsed).toEqual({ type: "error" });
    expect(prepared[2]?.processedMessages).toEqual({
      messages: [],
      rolledUpToolCalls: [],
    });
  });

  it("reconciles overlapping traces by observation timestamp", () => {
    const prepared = prepareSessionTimelineObservations(
      [
        observation(
          "generation-1",
          [{ role: "user", content: "User 1" }],
          "Assistant 1",
          "GENERATION",
          new Date(0),
        ),
        observation(
          "generation-3",
          [
            { role: "user", content: "User 1" },
            { role: "assistant", content: "Assistant 1" },
            { role: "user", content: "User 2" },
            { role: "assistant", content: "Assistant 2" },
            { role: "user", content: "User 3" },
          ],
          "Assistant 3",
          "GENERATION",
          new Date(20),
        ),
        observation(
          "generation-2",
          [
            { role: "user", content: "User 1" },
            { role: "assistant", content: "Assistant 1" },
            { role: "user", content: "User 2" },
          ],
          "Assistant 2",
          "GENERATION",
          new Date(10),
        ),
      ],
      true,
    );

    expect(prepared[1]?.processedMessages.messages).toMatchObject([
      { role: "user", parts: [{ type: "text", text: "User 3" }] },
      { role: "assistant", parts: [{ type: "text", text: "Assistant 3" }] },
    ]);
    expect(prepared[2]?.processedMessages.messages).toMatchObject([
      { role: "user", parts: [{ type: "text", text: "User 2" }] },
      { role: "assistant", parts: [{ type: "text", text: "Assistant 2" }] },
    ]);
  });
});
