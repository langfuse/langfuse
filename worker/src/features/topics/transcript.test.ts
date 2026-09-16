import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  prepareTrace,
  serializeTraceTranscript,
  type TopicsObservation,
} from "@langfuse/shared/topics/server";

const observation = (
  id: string,
  overrides: Partial<TopicsObservation> = {},
): TopicsObservation => ({
  id,
  projectId: "project",
  traceId: "trace",
  parentObservationId: null,
  type: "GENERATION",
  name: "chat",
  startTime: "2026-09-15T10:00:00.000Z",
  endTime: "2026-09-15T10:00:01.000Z",
  eventTimestamp: "2026-09-15T10:00:02.000Z",
  level: "DEFAULT",
  statusMessage: null,
  input: null,
  output: null,
  metadata: {},
  ...overrides,
});

describe("Topics trace input", () => {
  it("prepares existing OpenAI Agents and Gemini trace fixtures", () => {
    for (const name of [
      "openai-agents-2025-09-30",
      "google-gemini-2025-08-01",
    ]) {
      const fixture = JSON.parse(
        readFileSync(
          join(
            __dirname,
            "../../__tests__/chatml/framework-traces",
            `${name}.trace.json`,
          ),
          "utf8",
        ),
      ) as {
        observations: Array<TopicsObservation & { updatedAt: string }>;
      };
      const prepared = prepareTrace(
        fixture.observations.map((row) => ({
          ...row,
          eventTimestamp: row.updatedAt,
        })),
      );
      const projected = serializeTraceTranscript(prepared);
      expect(
        projected.sourceReferences.some((ref) => ref.source === "output"),
      ).toBe(true);
      expect(projected.coverage.observationCount).toBe(
        fixture.observations.length,
      );
      expect(projected.text).not.toContain("[object Object]");
    }
  });

  it("is independent of storage order but changes for late error evidence", () => {
    const rows = [
      observation("root", { type: "SPAN", input: { b: 2, a: 1 } }),
      observation("child", {
        parentObservationId: "root",
        output: false,
      }),
    ];
    const first = prepareTrace(rows);
    const reordered = prepareTrace([
      rows[1],
      { ...rows[0], input: { a: 1, b: 2 } },
    ]);
    expect(serializeTraceTranscript(first)).toEqual(
      serializeTraceTranscript(reordered),
    );
    expect(first.sourceSnapshotHash).toBe(reordered.sourceSnapshotHash);
    expect(serializeTraceTranscript(first).text).toContain("false");
    const changed = prepareTrace([
      rows[0],
      { ...rows[1], level: "ERROR", statusMessage: "Permission denied" },
    ]);
    expect(serializeTraceTranscript(changed).inputHash).not.toBe(
      serializeTraceTranscript(first).inputHash,
    );
  });

  it("references replayed history and preserves repeated ID-less tool calls", () => {
    const user = { role: "user", content: "Search again" };
    const assistant = { role: "assistant", content: "Found two results" };
    const call = {
      role: "assistant",
      tool_calls: [
        { type: "function", function: { name: "search", arguments: "{}" } },
      ],
    };
    const prepared = prepareTrace([
      observation("first", { input: [user], output: [assistant] }),
      observation("second", {
        startTime: "2026-09-15T10:00:03.000Z",
        endTime: "2026-09-15T10:00:04.000Z",
        input: [user, assistant, user],
        output: [call, call],
      }),
    ]);
    const input = serializeTraceTranscript(prepared);
    expect(input.text.match(/Search again/g)).toHaveLength(2);
    expect(input.text).toContain("Replayed context");
    expect(input.text.match(/\\"name\\":\\"search\\"/g)).toHaveLength(2);
  });

  it("keeps parallel branches, emits parent output last, and reports missing parents", () => {
    const prepared = prepareTrace([
      observation("root", { type: "SPAN", output: "All branches finished" }),
      observation("a", { parentObservationId: "root", output: "same answer" }),
      observation("b", { parentObservationId: "root", output: "same answer" }),
      observation("orphan", { parentObservationId: "missing", output: 0 }),
    ]);
    const input = serializeTraceTranscript(prepared);
    expect(input.text.match(/same answer/g)).toHaveLength(2);
    expect(input.text.indexOf("All branches finished")).toBeGreaterThan(
      input.text.lastIndexOf("same answer"),
    );
    expect(input.coverage.missingParentIds).toEqual(["missing"]);
    expect(input.coverage.overlappingSiblingPairs).toBe(1);
  });

  it("bounds large content with declared omissions and never sends media payloads", () => {
    const prepared = prepareTrace([
      observation("media", {
        input: [
          {
            role: "user",
            content: [
              { type: "text", text: "x".repeat(20_000) },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,SECRET_IMAGE" },
              },
            ],
          },
        ],
        output: "An image was provided",
      }),
    ]);
    const input = serializeTraceTranscript(prepared);
    expect(prepared.blocks.every((block) => block.text.length <= 4_000)).toBe(
      true,
    );
    expect(input.text).not.toContain("SECRET_IMAGE");
    expect(input.coverage.truncatedBlockCount).toBeGreaterThan(0);
    expect(input.coverage.mediaPartCount).toBe(1);
    expect(input.sourceReferences.length).toBeGreaterThan(0);
  });

  it("retains data beside message containers and removes raw media from ID-less outputs", () => {
    const prepared = prepareTrace([
      observation("structured", {
        input: {
          messages: [{ role: "user", content: "Can this shipment arrive?" }],
          shipment: { deliveryBlocked: true },
        },
        output: [
          {
            role: "assistant",
            tool_calls: [
              {
                type: "function",
                function: { name: "inspect", arguments: "{}" },
              },
            ],
            content: [
              {
                type: "image",
                source: { type: "base64", data: "PRIVATE_PAYLOAD" },
              },
            ],
          },
        ],
      }),
    ]);
    const input = serializeTraceTranscript(prepared);
    expect(input.text).toContain("deliveryBlocked");
    expect(input.text).not.toContain("PRIVATE_PAYLOAD");
  });

  it("keeps an existing audio transcript without passing audio bytes to the model", () => {
    const input = serializeTraceTranscript(
      prepareTrace([
        observation("audio", {
          output: {
            role: "assistant",
            content: null,
            audio: {
              id: "audio-1",
              data: "PRIVATE_AUDIO_BYTES",
              transcript: "Please contact billing support for the refund.",
            },
          },
        }),
      ]),
    );
    expect(input.text).toContain(
      "Please contact billing support for the refund.",
    );
    expect(input.text).not.toContain("PRIVATE_AUDIO_BYTES");
  });
});
