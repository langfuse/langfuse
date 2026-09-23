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
        observations: TopicsObservation[];
      };
      const prepared = prepareTrace(fixture.observations);
      const projected = serializeTraceTranscript(prepared);
      expect(
        JSON.parse(projected.text).some(
          (block: { source?: string }) => block.source === "output",
        ),
      ).toBe(true);
      expect(projected.coverage.observationCount).toBe(
        fixture.observations.length,
      );
      expect(projected.text).not.toContain("[object Object]");
    }
  });

  it("keeps parallel branches, emits parent output last, and reports missing parents", () => {
    const prepared = prepareTrace([
      observation("root", { output: "All branches finished" }),
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
              {
                type: "text",
                text:
                  "data:data:image/svg+xml;base64,INLINE_PAYLOAD followed by " +
                  "x".repeat(20_000),
              },
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
    expect(input.text).not.toContain("SECRET_IMAGE");
    expect(input.text).not.toContain("INLINE_PAYLOAD");
    expect(input.text).toContain("data:[media payload omitted] followed by");
    expect(input.coverage.truncatedBlockCount).toBeGreaterThan(0);
    expect(input.coverage.mediaPartCount).toBe(1);
    expect(input.hasContent).toBe(true);
  });
});
