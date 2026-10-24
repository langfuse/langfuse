/**
 * Mapping of gen_ai.system_instructions onto gen_ai.input.messages.
 *
 * Structured LiteLLM messages (`{role, parts}`) must be prepended as-is.
 * Canonical text parts stay concatenated. Empty or unmappable values are
 * skipped instead of being string-coerced to "[object Object]".
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: "test-project-system-instructions",
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "3.8.1",
  });

type OtelAttribute = { key: string; value: Record<string, unknown> };

const buildBatch = (attributes: OtelAttribute[]): ResourceSpan[] => [
  {
    resource: {
      attributes: [{ key: "service.name", value: { stringValue: "test-svc" } }],
    },
    scopeSpans: [
      {
        scope: {
          name: "langfuse-sdk",
          version: "3.8.1",
          attributes: [
            { key: "public_key", value: { stringValue: "pk-test" } },
          ],
        },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "litellm_request",
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes,
            status: {},
          },
        ],
      },
    ],
  },
];

const parseObservationInput = (events: { type: string; body: unknown }[]) => {
  const observation = events.find(
    (event) => event.type.endsWith("-create") && event.type !== "trace-create",
  );
  const input = (observation?.body as { input?: unknown } | undefined)?.input;
  return typeof input === "string" ? JSON.parse(input) : input;
};

const mapSystemInstructions = async (
  inputMessages: unknown,
  systemInstructions: unknown,
) => {
  const processor = createProcessor();
  const events = await processor.processToIngestionEvents(
    buildBatch([
      {
        key: "gen_ai.input.messages",
        value: { stringValue: JSON.stringify(inputMessages) },
      },
      {
        key: "gen_ai.system_instructions",
        value: {
          stringValue:
            typeof systemInstructions === "string"
              ? systemInstructions
              : JSON.stringify(systemInstructions),
        },
      },
    ]),
  );
  return parseObservationInput(events);
};

describe("OTel gen_ai.system_instructions mapping", () => {
  const userMessages = [
    { role: "user", parts: [{ type: "text", content: "Hello" }] },
  ];

  it("preserves structured system messages instead of string-coercing them", async () => {
    const systemInstructions = [
      {
        role: "system",
        parts: [{ type: "text", content: "Be concise." }],
      },
      {
        role: "system",
        parts: [{ type: "text", content: "Use plain language." }],
      },
    ];

    const input = await mapSystemInstructions(userMessages, systemInstructions);

    expect(input).toEqual([...systemInstructions, ...userMessages]);
    expect(JSON.stringify(input)).not.toContain("[object Object]");
  });

  it("concatenates canonical text instruction parts into one system message", async () => {
    const systemInstructions = [
      { type: "text", content: "You are a helpful assistant." },
      { type: "text", content: "Answer concisely." },
    ];

    const input = await mapSystemInstructions(userMessages, systemInstructions);

    expect(input).toEqual([
      {
        role: "system",
        content: "You are a helpful assistant.\nAnswer concisely.",
      },
      ...userMessages,
    ]);
  });

  it("preserves non-text instruction parts without string coercion", async () => {
    const systemInstructions = [
      { type: "text", content: "Describe the image." },
      { type: "binary", content_type: "image/png", id: "file-1" },
    ];

    const input = await mapSystemInstructions(userMessages, systemInstructions);

    expect(input).toEqual([
      {
        role: "system",
        parts: [
          { type: "text", content: "Describe the image." },
          { type: "binary", content_type: "image/png", id: "file-1" },
        ],
      },
      ...userMessages,
    ]);
    expect(JSON.stringify(input)).not.toContain("[object Object]");
  });

  it("leaves input unchanged when instructions are empty or unmappable", async () => {
    expect(await mapSystemInstructions(userMessages, [])).toEqual(userMessages);
    expect(
      await mapSystemInstructions(userMessages, [
        { unexpected: true },
        null,
        42,
      ]),
    ).toEqual(userMessages);
  });

  it("does not prepend instructions when input already has a system message", async () => {
    const inputMessages = [
      {
        role: "system",
        parts: [{ type: "text", content: "Existing system prompt." }],
      },
      ...userMessages,
    ];
    const systemInstructions = [
      { role: "system", parts: [{ type: "text", content: "Be concise." }] },
    ];

    const input = await mapSystemInstructions(
      inputMessages,
      systemInstructions,
    );

    expect(input).toEqual(inputMessages);
  });
});
