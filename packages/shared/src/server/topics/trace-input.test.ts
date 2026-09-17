import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  topicProcessingConfigSchema,
  type TopicFacetVersion,
} from "../../topics";
import { loadTraceSnapshot } from "./load-trace";
import { loadTopicTranscript } from "./trace-input";
import {
  hashTraceSnapshot,
  prepareTrace,
  type TopicsObservation,
} from "./transcript";

vi.mock("./load-trace", () => ({ loadTraceSnapshot: vi.fn() }));

const observations: TopicsObservation[] = [
  {
    id: "span-a",
    projectId: "project-a",
    traceId: "trace-a",
    parentObservationId: null,
    type: "GENERATION",
    name: "chat",
    startTime: "2026-09-15T10:00:00.000Z",
    endTime: "2026-09-15T10:00:01.000Z",
    eventTimestamp: "2026-09-15 10:00:02.000",
    level: "DEFAULT",
    statusMessage: null,
    input: JSON.stringify([
      { role: "user", content: "Please cancel my subscription. ".repeat(300) },
    ]),
    output: JSON.stringify({
      role: "assistant",
      content: "Your subscription was cancelled.",
    }),
    metadata: {},
  },
];
const facet: TopicFacetVersion = {
  id: "facet-v1",
  projectId: "project-a",
  facetId: "facet-a",
  version: 1,
  prompt: "Describe the user goal.",
  processingConfig: topicProcessingConfigSchema.parse({ projection: "intent" }),
  createdAt: "2026-09-15T10:00:00.000Z",
};
const snapshot = (rows = observations) => ({
  projectId: "project-a",
  traceId: "trace-a",
  observations: rows,
  timestamp: rows[0].startTime,
  sourceSnapshotHash: hashTraceSnapshot(rows),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadTraceSnapshot).mockResolvedValue(snapshot());
});

describe("shared in-memory Topics input", () => {
  it("uses identical evidence for every facet, regardless of its prompt or token budget", async () => {
    const rows = [
      {
        ...observations[0],
        input: [
          { role: "system", content: "Follow the refund policy." },
          {
            role: "user",
            content: "Please cancel my subscription. ".repeat(300),
          },
        ],
      },
    ];
    vi.mocked(loadTraceSnapshot).mockResolvedValue(snapshot(rows));
    const results = await Promise.all(
      (["all", "intent", "issues"] as const)
        .map((projection, index) => ({
          projectId: "project-a",
          traceId: "trace-a",
          facet: {
            ...facet,
            prompt: `Facet instruction ${index}`,
            processingConfig: {
              ...facet.processingConfig,
              projection,
              maxInputTokens: index === 0 ? 8000 : 256,
            },
          },
        }))
        .map((request) => loadTopicTranscript(request)),
    );
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[0].transcript.text).toContain("Follow the refund policy.");
  });

  it("sanitizes ID-less tool fallback and preserves provider failure evidence", () => {
    const result = prepareTrace([
      {
        ...observations[0],
        output: {
          role: "assistant",
          content: [{ type: "reasoning", text: "PRIVATE_REASONING_TEXT" }],
          tool_calls: [
            { type: "function", function: { name: "search", arguments: "{}" } },
          ],
          audio: { data: "PRIVATE_AUDIO", transcript: "Contact billing." },
          reasoning_content: "PRIVATE_REASONING",
        },
      },
    ]);
    const text = JSON.stringify(result.blocks);
    expect(text).not.toContain("PRIVATE_AUDIO");
    expect(text).not.toContain("PRIVATE_REASONING");
    expect(text).not.toContain("PRIVATE_REASONING_TEXT");
    expect(text).toContain("Contact billing.");
    const response = prepareTrace([
      {
        ...observations[0],
        output: {
          object: "response",
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "Partial answer" }],
            },
          ],
        },
      },
    ]);
    expect(JSON.stringify(response.blocks)).toContain("max_output_tokens");
    const completion = prepareTrace([
      {
        ...observations[0],
        output: {
          choices: [
            {
              finish_reason: "length",
              message: { role: "assistant", content: "Partial answer" },
            },
          ],
        },
      },
    ]);
    expect(
      completion.blocks.some(
        (block) =>
          block.source === "status" &&
          block.text.includes('"finish_reason":"length"'),
      ),
    ).toBe(true);
  });

  it("retains later requests in large traces", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...observations[0],
      id: `span-${String(index).padStart(2, "0")}`,
      input: [
        {
          role: "user",
          content: index === 19 ? "LATEST_REQUEST_SENTINEL" : "Earlier request",
        },
      ],
      output: "Large tool result. ".repeat(300),
    }));
    vi.mocked(loadTraceSnapshot).mockResolvedValue(snapshot(rows));
    const large = await loadTopicTranscript({
      projectId: "project-a",
      traceId: "trace-a",
    });
    expect(large.transcript.text.length).toBeGreaterThan(24_000);
    expect(large.transcript.text).toContain("LATEST_REQUEST_SENTINEL");
    expect(large.transcript.sourceReferences).toHaveLength(60);
    expect(
      large.transcript.text.split("\n").every((line) => JSON.parse(line)),
    ).toBe(true);
  });

  it("keeps Gemini finish reasons and omits snake-case inline media in raw tool-call fallback", () => {
    const result = prepareTrace([
      {
        ...observations[0],
        id: "gemini-tool",
        input: null,
        output: {
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  { functionCall: { name: "inspect", args: {} } },
                  {
                    inline_data: {
                      mime_type: "image/png",
                      data: "PRIVATE_IMAGE_PAYLOAD",
                    },
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        },
      },
      {
        ...observations[0],
        id: "gemini-partial",
        input: null,
        output: {
          candidates: [
            {
              content: { role: "model", parts: [{ text: "Partial answer" }] },
              finishReason: "MAX_TOKENS",
            },
          ],
        },
      },
    ]);
    expect
      .soft(JSON.stringify(result.blocks))
      .not.toContain("PRIVATE_IMAGE_PAYLOAD");
    expect(
      result.blocks.some(
        (block) =>
          block.source === "status" && block.text.includes("MAX_TOKENS"),
      ),
    ).toBe(true);
  });

  it("reloads current evidence and changes fingerprints after source updates", async () => {
    const first = await loadTopicTranscript({
      projectId: "project-a",
      traceId: "trace-a",
    });
    vi.mocked(loadTraceSnapshot).mockResolvedValue(
      snapshot([{ ...observations[0], output: "Cancellation failed." }]),
    );
    const second = await loadTopicTranscript({
      projectId: "project-a",
      traceId: "trace-a",
    });
    expect(loadTraceSnapshot).toHaveBeenCalledTimes(2);
    expect(second.transcript.text).toContain("Cancellation failed.");
    expect(second.snapshotHash).not.toBe(first.snapshotHash);
    expect(second.transcript.inputHash).not.toBe(first.transcript.inputHash);
  });

  it("rejects a snapshot from another project", async () => {
    await expect(
      loadTopicTranscript({
        projectId: "other-project",
        traceId: "trace-a",
      }),
    ).rejects.toThrow("trace scope mismatch");
    expect(loadTraceSnapshot).toHaveBeenCalledWith({
      projectId: "other-project",
      traceId: "trace-a",
    });
  });
});
