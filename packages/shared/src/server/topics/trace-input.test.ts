import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTraceSnapshot } from "./load-trace";
import { loadTopicTranscript } from "./trace-input";
import {
  prepareTrace,
  serializeTraceTranscript,
  type TopicsObservation,
} from "./transcript";

vi.mock("./load-trace", () => ({ loadTraceSnapshot: vi.fn() }));
vi.mock("tiktoken", () => {
  throw new Error(
    "Shared transcript assembly must not load the worker tokenizer",
  );
});

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
const snapshot = (rows = observations) => ({
  projectId: "project-a",
  traceId: "trace-a",
  sessionId: "session-a",
  environment: "production",
  traceName: "Billing requests",
  observations: rows,
  timestamp: rows[0].startTime,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadTraceSnapshot).mockResolvedValue(snapshot());
});

describe("shared in-memory Topics input", () => {
  it("focuses on generations and tools and removes repeated prompt context", () => {
    const prompt = [
      { role: "system", content: "Follow the policy." },
      { role: "user", content: "Find my invoice." },
    ];
    const call = {
      role: "assistant",
      tool_calls: [
        { type: "function", function: { name: "search", arguments: "{}" } },
      ],
    };
    const transcript = serializeTraceTranscript(
      prepareTrace([
        {
          ...observations[0],
          id: "wrapper",
          type: "SPAN",
          input: "WRAPPER_PAYLOAD",
          output: "WRAPPER_RESULT",
          level: "ERROR",
          statusMessage: "Wrapper failed.",
        },
        {
          ...observations[0],
          id: "generation-a",
          parentObservationId: "wrapper",
          input: prompt,
          output: "Calling billing.",
        },
        {
          ...observations[0],
          id: "tool",
          parentObservationId: "generation-a",
          type: "TOOL",
          name: "billing",
          input: "invoice",
          output: "Invoice not found.",
        },
        {
          ...observations[0],
          id: "generation-b",
          parentObservationId: "wrapper",
          input: [
            ...prompt,
            { role: "assistant", content: "Calling billing." },
            prompt[1],
          ],
          output: [
            { role: "assistant", content: "Please check the invoice number." },
            call,
            call,
          ],
        },
      ]),
    );
    expect(transcript.text).not.toContain("WRAPPER_PAYLOAD");
    expect(transcript.text).not.toContain("WRAPPER_RESULT");
    expect(transcript.text.match(/Follow the policy/g)).toHaveLength(1);
    expect(transcript.text.match(/Find my invoice/g)).toHaveLength(1);
    expect(transcript.text.match(/Calling billing/g)).toHaveLength(1);
    expect(transcript.text.match(/\\"name\\":\\"search\\"/g)).toHaveLength(2);
    expect(transcript.text).toContain("TOOL billing");
    expect(transcript.text).toContain("Invoice not found.");
    expect(transcript.text).toContain("Please check the invoice number.");
    expect(transcript.text).toContain("Wrapper failed.");
  });

  it("uses span input and output when there are no generations or tools", () => {
    const transcript = serializeTraceTranscript(
      prepareTrace([
        {
          ...observations[0],
          type: "SPAN",
          input: "Find my invoice.",
          output: "Invoice found.",
        },
      ]),
    );
    expect(transcript.text).toContain("Find my invoice.");
    expect(transcript.text).toContain("Invoice found.");
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
      {
        ...observations[0],
        id: "audio",
        output: {
          role: "assistant",
          content: null,
          audio: {
            id: "audio-1",
            data: "PRIVATE_AUDIO_BYTES",
            transcript: "Please contact billing support for the refund.",
          },
        },
      },
    ]);
    const text = serializeTraceTranscript(result).text;
    expect(text).not.toContain("PRIVATE_AUDIO");
    expect(text).not.toContain("PRIVATE_REASONING");
    expect(text).not.toContain("PRIVATE_REASONING_TEXT");
    expect(text).toContain("Contact billing.");
    expect(text).toContain("Please contact billing support for the refund.");
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

  it("caps escaped JSON in large traces without losing later requests or the final response", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...observations[0],
      id: `span-${String(index).padStart(2, "0")}`,
      input: [
        {
          role: "user",
          content: index === 19 ? "LATEST_REQUEST_SENTINEL" : "Earlier request",
        },
      ],
      output: index === 19 ? "FINAL_RESPONSE" : '\\"\n🙂'.repeat(8_000),
    }));
    vi.mocked(loadTraceSnapshot).mockResolvedValue(snapshot(rows));
    const large = await loadTopicTranscript({
      projectId: "project-a",
      traceId: "trace-a",
    });
    expect(large.transcript.text.length).toBeLessThanOrEqual(10_000);
    expect(large.transcript.text).toContain("LATEST_REQUEST_SENTINEL");
    const json = JSON.parse(large.transcript.text);
    expect(Array.isArray(json)).toBe(true);
    expect(json.at(-2).text).toContain("FINAL_RESPONSE");
    expect(large.transcript.text).toContain("[content omitted]");
    expect(large.transcript.coverage.truncatedBlockCount).toBeGreaterThan(0);
    for (const block of json) {
      expect(block).not.toHaveProperty("observationId");
      expect(block).not.toHaveProperty("parentObservationId");
      expect(block).not.toHaveProperty("kind");
      expect(block).not.toHaveProperty("messageIndex");
      expect(block).not.toHaveProperty("blockId");
      expect(block).not.toHaveProperty("partIndex");
    }
  });

  it("omits the middle deterministically while preserving boundary evidence and late errors", () => {
    const rows: TopicsObservation[] = Array.from(
      { length: 500 },
      (_, index) => ({
        ...observations[0],
        id: `span-${String(index).padStart(3, "0")}`,
        input:
          index === 0
            ? { b: 2, a: 1, request: "FIRST_REQUEST" }
            : [{ role: "user", content: "Request" }],
        output: index === 499 ? "FINAL_RESPONSE" : "Response",
      }),
    );
    rows[0].output = false;
    const transcript = serializeTraceTranscript(prepareTrace(rows));
    expect(transcript.text.length).toBeLessThanOrEqual(10_000);
    expect(transcript.text).toContain("FIRST_REQUEST");
    expect(transcript.text).toContain("FINAL_RESPONSE");
    expect(transcript.text).toContain("false");
    expect(
      JSON.parse(transcript.text).some(
        (block: { source?: string }) => block.source === "truncation",
      ),
    ).toBe(true);
    expect(transcript.coverage.omittedBlockCount).toBeGreaterThan(0);
    const reordered = [
      { ...rows[0], input: { a: 1, b: 2, request: "FIRST_REQUEST" } },
      ...rows.slice(1),
    ].reverse();
    expect(serializeTraceTranscript(prepareTrace(reordered))).toEqual(
      transcript,
    );
    const changed = serializeTraceTranscript(
      prepareTrace([
        { ...rows[0], level: "ERROR", statusMessage: "Permission denied" },
        ...rows.slice(1),
      ]),
    );
    expect(changed.text).toContain("Permission denied");
    expect(changed.text).not.toBe(transcript.text);
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

  it("reloads current transcript evidence after source updates", async () => {
    const first = await loadTopicTranscript({
      projectId: "project-a",
      traceId: "trace-a",
    });
    vi.mocked(loadTraceSnapshot).mockResolvedValue({
      ...snapshot([{ ...observations[0], output: "Cancellation failed." }]),
      environment: "staging",
      traceName: "Updated billing request",
    });
    const second = await loadTopicTranscript({
      projectId: "project-a",
      traceId: "trace-a",
    });
    expect(loadTraceSnapshot).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({
      environment: "production",
      traceName: "Billing requests",
    });
    expect(second).toMatchObject({
      environment: "staging",
      traceName: "Updated billing request",
    });
    expect(second.transcript.text).toContain("Cancellation failed.");
    expect(second.transcript.text).not.toBe(first.transcript.text);
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
