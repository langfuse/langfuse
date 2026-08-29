import { describe, it, expect, vi } from "vitest";
import { createHash } from "crypto";
import { readFileSync, existsSync, writeFileSync, readdirSync } from "fs";
import path from "path";

import {
  normalizeInput,
  normalizeOutput,
  combineInputOutputMessages,
  cleanLegacyOutput,
  extractAdditionalInput,
  ChatMlArraySchema,
} from "@langfuse/shared/src/utils/chatml";

import { deepParseJson } from "@langfuse/shared";
import { OtelIngestionProcessor } from "@langfuse/shared/src/server";

describe("ChatML Integration", () => {
  it("should handle OpenAI multimodal format", () => {
    const input = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,..." },
            },
          ],
        },
      ],
      temperature: 0.7,
      model: "gpt-4-vision-preview",
    };

    const ctx = { metadata: { scope: { name: "langfuse-sdk" } } };
    const inResult = normalizeInput(input, ctx);
    const additionalInput = extractAdditionalInput(input);

    expect(inResult.success).toBe(true);
    expect(inResult.data).toHaveLength(1);
    expect(Array.isArray(inResult.data?.[0].content)).toBe(true);
    expect(additionalInput).toEqual({
      temperature: 0.7,
      model: "gpt-4-vision-preview",
    });
  });

  it("should handle nested array format [[ChatML...]]", () => {
    const input = [
      [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
    ];
    const output = { role: "assistant", content: "Hi there!" };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const allMessages = combineInputOutputMessages(inResult, outResult, output);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected data to be defined");
    expect(inResult.data).toHaveLength(2);
    expect(allMessages).toHaveLength(3);
  });

  it("should handle legacy completion format {completion: string}", () => {
    const input = [{ role: "user", content: "Write a haiku" }];
    const output = {
      completion:
        "Cherry blossoms fall\nSoftly on the morning dew\nSpring has come at last",
    };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const outputClean = cleanLegacyOutput(output, output);
    const allMessages = combineInputOutputMessages(
      inResult,
      outResult,
      outputClean,
    );

    expect(inResult.success).toBe(true);
    expect(allMessages).toHaveLength(2);
    expect(allMessages[1].json).toEqual({
      completion:
        "Cherry blossoms fall\nSoftly on the morning dew\nSpring has come at last",
    });
  });

  it("should handle placeholder messages", () => {
    const input = [
      { role: "user", content: "Hello" },
      { type: "placeholder", name: "Processing" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "How can I help?" };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const allMessages = combineInputOutputMessages(inResult, outResult, output);

    expect(inResult.success).toBe(true);
    expect(allMessages).toHaveLength(4);
    expect(allMessages[1].type).toBe("placeholder");
  });

  it("should handle circular references gracefully", () => {
    const input: any = [{ role: "user", content: "test" }];
    input[0].circular = input[0];

    expect(() => normalizeInput(input)).not.toThrow();
  });

  it("should not throw when the input object has a null scope (typeof null === 'object')", () => {
    // Regression: when no metadata is passed, normalizeInput falls back to
    // using the input as metadata. An input object with a literal `scope: null`
    // (e.g. Dify workflow inputs) used to crash every adapter's detect(), which
    // does `typeof meta.scope === "object"` and then reads `meta.scope.name` —
    // `typeof null === "object"` slipped a null through the guard.
    const input = {
      scope: null,
      page_url: null,
      page_title: null,
      country: "ch",
      locale: "de",
      "sys.query": "Which biomarkers are in the Advanced Blood Test?",
    };

    expect(() => normalizeInput(input)).not.toThrow();
    expect(() => normalizeOutput({ scope: null, answer: "..." })).not.toThrow();
  });

  it("should handle very large inputs", () => {
    const largeContent = "x".repeat(1000000);
    const input = [{ role: "user", content: largeContent }];

    const inResult = normalizeInput(input);

    expect(inResult.success).toBe(true);
    expect(inResult.data?.[0].content).toHaveLength(1000000);
  });

  it("should handle Google Gemini format with simple string contents", () => {
    const input = {
      model: "gemini-2.5-flash",
      contents: "What is Langfuse?",
    };
    const output = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: "**Langfuse** is an **open-source observability and evaluation platform** for LLM applications.",
              },
            ],
            role: "model",
          },
          finish_reason: "STOP",
          index: 0,
        },
      ],
      model_version: "gemini-2.5-flash",
      usage_metadata: {
        candidates_token_count: 20,
        prompt_token_count: 6,
        total_token_count: 26,
      },
    };

    const ctx = {
      metadata: {
        scope: { name: "openinference.instrumentation.google_genai" },
      },
    };

    const inResult = normalizeInput(input, ctx);
    const outResult = normalizeOutput(output, ctx);
    const allMessages = combineInputOutputMessages(inResult, outResult, output);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected inResult.data to be defined");
    expect(inResult.data).toHaveLength(1);
    expect(inResult.data[0].role).toBe("user");
    expect(inResult.data[0].content).toBe("What is Langfuse?");

    expect(outResult.success).toBe(true);
    if (!outResult.data)
      throw new Error("Expected outResult.data to be defined");
    expect(outResult.data).toHaveLength(1);
    expect(outResult.data[0].role).toBe("model");
    expect(outResult.data[0].content).toContain("Langfuse");

    expect(allMessages).toHaveLength(2);
    expect(allMessages[1].role).toBe("model");
  });

  it("should handle Google Gemini format with contents array and system instruction", () => {
    const input = {
      model: "gemini-2.0-flash",
      config: {
        http_options: {
          headers: {
            "x-goog-api-client": "google-adk/1.12.0 gl-python/3.12.11",
            "user-agent": "google-adk/1.12.0 gl-python/3.12.11",
          },
        },
        system_instruction:
          'Always greet using the say_hello tool.\n\nYou are an agent. Your internal name is "hello_agent".',
        tools: [
          {
            function_declarations: [
              {
                name: "say_hello",
              },
            ],
          },
        ],
      },
      contents: [
        {
          parts: [
            {
              text: "hi",
            },
          ],
          role: "user",
        },
      ],
    };

    const ctx = {
      metadata: {
        scope: { name: "openinference.instrumentation.google_genai" },
      },
    };

    const inResult = normalizeInput(input, ctx);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected data to be defined");
    expect(inResult.data).toHaveLength(2);
    expect(inResult.data[0].role).toBe("system");
    expect(inResult.data[0].content).toContain("hello_agent");
    expect(inResult.data[1].role).toBe("user");
    expect(inResult.data[1].content).toBe("hi");
  });

  it("should handle Google Gemini format with function_call and function_response", () => {
    const input = {
      model: "gemini-2.0-flash",
      config: {
        system_instruction:
          'Always greet using the say_hello tool.\n\nYou are an agent. Your internal name is "hello_agent".',
        tools: [
          {
            function_declarations: [
              {
                name: "say_hello",
              },
            ],
          },
        ],
      },
      contents: [
        {
          parts: [
            {
              text: "hi",
            },
          ],
          role: "user",
        },
        {
          parts: [
            {
              function_call: {
                args: {},
                name: "say_hello",
              },
            },
          ],
          role: "model",
        },
        {
          parts: [
            {
              function_response: {
                name: "say_hello",
                response: {
                  greeting: "Hello Langfuse 👋",
                },
              },
            },
          ],
          role: "user",
        },
      ],
    };

    const ctx = {
      metadata: {
        scope: { name: "openinference.instrumentation.google_genai" },
      },
    };

    const inResult = normalizeInput(input, ctx);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected data to be defined");
    expect(inResult.data).toHaveLength(4);
    expect(inResult.data[0].role).toBe("system");
    expect(inResult.data[1].role).toBe("user");
    expect(inResult.data[1].content).toBe("hi");
    expect(inResult.data[2].role).toBe("model");
    expect(inResult.data[2].tool_calls).toBeDefined();
    expect(inResult.data[2].tool_calls?.[0].name).toBe("say_hello");
    expect(inResult.data[3].role).toBe("user");
    expect(typeof inResult.data[3].content).toBe("string");
    expect(inResult.data[3].content).toContain("Hello Langfuse");
  });

  it("should handle LangGraph messages with type field", () => {
    const input = {
      messages: [
        {
          content: "Search the web for 'example' and summarize.",
          additional_kwargs: {},
          response_metadata: {},
          type: "human",
          name: null,
          id: "4f5904a4-473c-443c-af46-68765777a2f0",
          example: false,
        },
        {
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_123",
                function: {
                  arguments: { query: "example" },
                  name: "Web-Search",
                },
                type: "function",
              },
            ],
          },
          type: "ai",
          id: "run-123",
        },
        {
          content: [{ url: "https://example.com", title: "Example Result" }],
          type: "tool",
          name: "Web-Search",
          tool_call_id: "call_123",
        },
      ],
    };

    const ctx = {
      metadata: {
        scope: { name: "langfuse-sdk" },
        framework: "langgraph",
      },
    };

    const inResult = normalizeInput(input, ctx);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected data to be defined");
    expect(inResult.data).toHaveLength(3);
    expect(inResult.data[0].role).toBe("user");
    expect(inResult.data[0].content).toBe(
      "Search the web for 'example' and summarize.",
    );
    expect(inResult.data[1].role).toBe("assistant");
    expect(inResult.data[2].role).toBe("tool");
  });

  it("should handle Microsoft Agent format with simple text parts", () => {
    // Microsoft Agent format uses top-level parts array (not OpenAI format)
    const createInput = () => [
      {
        role: "user",
        parts: [
          {
            type: "text",
            content: "What's the weather like in Portland?",
          },
        ],
      },
    ];

    // Test with generic adapter explicitly
    const resultWithFramework = normalizeInput(createInput(), {
      framework: "generic",
    });
    expect(resultWithFramework.success).toBe(true);
    expect(resultWithFramework.data?.[0].content).toBe(
      "What's the weather like in Portland?",
    );

    // Test automatic detection (should use generic adapter since OpenAI/Gemini reject parts)
    const inResult = normalizeInput(createInput(), {
      observationName: "invoke_agent",
    });

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected data to be defined");
    expect(inResult.data).toHaveLength(1);
    expect(inResult.data[0].role).toBe("user");
    expect(inResult.data[0].content).toBe(
      "What's the weather like in Portland?",
    );
  });

  it("should handle Microsoft Agent framework format with parts-based tool calls", () => {
    const input = [
      {
        role: "user",
        parts: [
          {
            type: "text",
            content: "What's the weather like in Portland?",
          },
        ],
      },
    ];

    const output = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool_call",
            id: [
              "run_9guMCbt68iSVgtsx6WdKMA18",
              "call_Sz1QP8T7fuJkIECGDLFWOorq",
            ],
            name: "get_weather",
            arguments: {
              location: "Portland",
            },
          },
        ],
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool_call_response",
            id: [
              "run_9guMCbt68iSVgtsx6WdKMA18",
              "call_Sz1QP8T7fuJkIECGDLFWOorq",
            ],
            response: "The weather in Portland is stormy with a high of 19°C.",
          },
        ],
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            content:
              "The weather in Portland is currently stormy with a high temperature of 19°C.",
          },
        ],
      },
    ];

    const ctx = {
      metadata: {
        scope: { name: "agent_framework" },
      },
    };

    const inResult = normalizeInput(input, ctx);
    const outResult = normalizeOutput(output, ctx);
    const allMessages = combineInputOutputMessages(inResult, outResult, output);

    expect(inResult.success).toBe(true);
    if (!inResult.data) throw new Error("Expected inResult.data to be defined");
    expect(inResult.data).toHaveLength(1);
    expect(inResult.data[0].role).toBe("user");
    expect(inResult.data[0].content).toBe(
      "What's the weather like in Portland?",
    );

    expect(outResult.success).toBe(true);
    if (!outResult.data)
      throw new Error("Expected outResult.data to be defined");
    expect(outResult.data).toHaveLength(3);
    expect(outResult.data[0].role).toBe("assistant");
    // Tool calls should be extracted to tool_calls field (normalized format)
    expect(outResult.data[0].tool_calls).toBeDefined();
    expect(outResult.data[0].tool_calls?.[0].name).toBe("get_weather");
    expect(outResult.data[0].tool_calls?.[0].id).toBe(
      "call_Sz1QP8T7fuJkIECGDLFWOorq",
    );
    expect(outResult.data[0].tool_calls?.[0].arguments).toBe(
      '{"location":"Portland"}',
    );

    expect(outResult.data[1].role).toBe("tool");
    expect(outResult.data[1].content).toBe(
      "The weather in Portland is stormy with a high of 19°C.",
    );

    expect(outResult.data[2].role).toBe("assistant");
    expect(outResult.data[2].content).toBe(
      "The weather in Portland is currently stormy with a high temperature of 19°C.",
    );

    expect(allMessages).toHaveLength(4);
  });
});

const tracesDir = path.resolve(__dirname, "framework-traces");
const traceFiles = readdirSync(tracesDir).filter((f) =>
  f.endsWith(".trace.json"),
);

const otelReconstructionPrefixes = [
  "gen_ai.prompt",
  "gen_ai.completion",
  "llm.input_messages",
  "llm.output_messages",
] as const;

const expectedOtelReconstructionDigests = {
  "agno-2025-06-11.trace.json:b38a82eaa62b551e:llm.input_messages":
    "79dae2697161990380f3cc2409030d1e958b30706babd1a73613b10f5b807348",
  "agno-2025-06-11.trace.json:ca136de468e156c9:llm.input_messages":
    "b754777938eee8274ad8891da07446072ab8fe7898d99fd9430abb26aa278ec5",
  "beeai-2025-08-01.trace.json:52df0f7f9dad6b23:llm.input_messages":
    "9e09b39eafc8bf335608817d86dca4c7d6debbe8ff464bf68407388fc2be70c9",
  "beeai-2025-08-01.trace.json:f50f7bbf13112df9:llm.output_messages":
    "d874643405382404cadb4e70a9046f50357bdfb8bf5a4e44cc4d50a0216c101c",
  "beeai-2025-08-01.trace.json:4c5c5a7936ca24bc:llm.input_messages":
    "a736bdc132475ed501b72ecc14087aaa73bd01d54ed0b86f660f7059e93b6f4b",
  "beeai-2025-08-01.trace.json:1f956cbea34725bd:llm.input_messages":
    "f50c6ed16b46a5fd0c38aa5d1649759e6bd26bf3b279c058340ea4f2d1b5f17c",
  "crewai-2025-07-11.trace.json:231c43964b7e7e63:llm.input_messages":
    "090af8a41c384a74784270cecd1743fbe64b61af1344a7ad327eca06d5027bda",
  "crewai-2025-07-11.trace.json:231c43964b7e7e63:llm.output_messages":
    "5d2c3c0a6f1aafd174f5015efbda809a4bcddaf2cfd19c1b26ead101542f6e9d",
  "google-adk-2025-08-28.trace.json:bded677884f031ce:llm.input_messages":
    "077595470a234fdd1638cd54626bf6d9de33413b065f885d744d5384854c948d",
  "google-adk-2025-08-28.trace.json:bded677884f031ce:llm.output_messages":
    "f7c165eb9d7053e004498ff13be315d4c8dd1be1994854a14a3d1f2e2908b934",
  "google-adk-2025-08-28.trace.json:f6e4c65297e40c96:llm.input_messages":
    "a2c27fe417936852bb3ec99f8a5e333b56caf3658738bf133e8d1ec329f95e34",
  "google-adk-2025-08-28.trace.json:f6e4c65297e40c96:llm.output_messages":
    "3ec3d61cd82e7d8193ad0b9c4a4663fd19613afbe3014ec44f33399275400f71",
  "google-gemini-2025-08-01.trace.json:b7a63ca7e1d083bc:llm.input_messages":
    "02fb5023a8ab3234b69b0af60ef2fffe78e0443d452323ea733b10ba8d2e6757",
  "google-gemini-2025-08-01.trace.json:b7a63ca7e1d083bc:llm.output_messages":
    "9d51690e135533dbb44127193472d729d5afd48b2d69a16b1e79ccb68860470b",
  "koog-2025-08-26.trace.json:e44e72cf2d221781:gen_ai.prompt":
    "12541a8d701c9962ebcc381fbf54539d443a093a8c8cf3e22acd63f0ea146910",
  "koog-2025-08-26.trace.json:e44e72cf2d221781:gen_ai.completion":
    "41b2ea825990164dcecd9fe607a45ff5601fbd7d3146ce79b32dc69e9b2f1c6d",
  "koog-2025-08-26.trace.json:042f9350c3729147:gen_ai.prompt":
    "05dc418f9c1829e3b0c5d8d91086313dac3e6d7cc6d37655fe8d76ae082fab41",
  "koog-2025-08-26.trace.json:042f9350c3729147:gen_ai.completion":
    "d913abf5a058217e9436318ed64e54570a477063514aa499ef0941024ffdc6a5",
  "openai-agents-2025-09-30.trace.json:90d94774e8e3724d:llm.input_messages":
    "e7e0d957608131d91ff7486fff064b9455817f005b7b29d309a3bbc231742e1c",
  "openai-agents-2025-09-30.trace.json:90d94774e8e3724d:llm.output_messages":
    "0d1254e7d61fdf2126da1820a5be2c7146287fe69c8b10b686dc1c2d5b9f333d",
  "openai-agents-2025-09-30.trace.json:98870087af69bf06:llm.input_messages":
    "feb45e1214f1e634d58a5888f58438d2ebe3ebddad1e67a75d67e3539df77971",
  "openai-agents-2025-09-30.trace.json:98870087af69bf06:llm.output_messages":
    "f819f9144a675fd46f4e445ac29084941bee1f3404f99f291d5a8cd799b2c06c",
  "vertex-ai-2025-08-01.trace.json:125abcbf5c41f4df:llm.input_messages":
    "1ec974ca95d73babe518739e05965f4dafe17572a47cec6fe66d2653303d0492",
  "vertex-ai-2025-08-01.trace.json:125abcbf5c41f4df:llm.output_messages":
    "acf3c7eeb02edd9d558bd3e9138cf022926c40d9a87c4e917a1ec98e9a467cc4",
};

type StructuralValue =
  | { type: "primitive"; value: unknown }
  | { type: "array"; length: number; entries: [string, StructuralValue][] }
  | { type: "object"; entries: [string, StructuralValue][] };

const encodeStructure = (value: unknown): StructuralValue => {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      entries: Object.keys(value).map((key) => [
        key,
        encodeStructure((value as unknown as Record<string, unknown>)[key]),
      ]),
    };
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return {
      type: "object",
      entries: Object.keys(record).map((key) => [
        key,
        encodeStructure(record[key]),
      ]),
    };
  }

  return { type: "primitive", value };
};

const getStructuralDigest = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(encodeStructure(value)))
    .digest("hex");

describe("OTel reconstruction compatibility against real observations", () => {
  it("matches the output recorded from the pre-hardening implementation", () => {
    const processor = new OtelIngestionProcessor({
      projectId: "test-project",
      publicKey: "pk-test",
      sdkName: "test",
      sdkVersion: "test",
    });
    const reconstruct = (
      processor as unknown as {
        convertKeyPathToNestedObject: (
          input: Record<string, unknown>,
          prefix: string,
        ) => unknown;
      }
    ).convertKeyPathToNestedObject.bind(processor);
    const actualDigests: Record<string, string> = {};
    const relevantFiles = new Set<string>();
    let relevantAttributeCount = 0;

    for (const traceFile of [...traceFiles].sort()) {
      const traceContent = readFileSync(
        path.join(tracesDir, traceFile),
        "utf-8",
      );
      const observations = JSON.parse(traceContent).observations as Array<{
        id: string;
        metadata?: string | { attributes?: Record<string, unknown> };
      }>;

      for (const observation of observations) {
        if (!observation.metadata) continue;

        const metadata =
          typeof observation.metadata === "string"
            ? (JSON.parse(observation.metadata) as {
                attributes?: Record<string, unknown>;
              })
            : observation.metadata;
        const attributes = metadata.attributes;
        if (!attributes) continue;

        for (const prefix of otelReconstructionPrefixes) {
          const attributeKeys = Object.keys(attributes).filter((key) =>
            key.startsWith(prefix),
          );
          if (attributeKeys.length === 0) continue;

          relevantFiles.add(traceFile);
          relevantAttributeCount += attributeKeys.length;
          const prefixedAttributes = Object.fromEntries(
            attributeKeys.map((key) => [key, attributes[key]]),
          );
          const caseId = `${traceFile}:${observation.id}:${prefix}`;
          actualDigests[caseId] = getStructuralDigest(
            reconstruct(prefixedAttributes, prefix),
          );
        }
      }
    }

    expect([...relevantFiles]).toEqual([
      "agno-2025-06-11.trace.json",
      "beeai-2025-08-01.trace.json",
      "crewai-2025-07-11.trace.json",
      "google-adk-2025-08-28.trace.json",
      "google-gemini-2025-08-01.trace.json",
      "koog-2025-08-26.trace.json",
      "openai-agents-2025-09-30.trace.json",
      "vertex-ai-2025-08-01.trace.json",
    ]);
    expect(relevantAttributeCount).toBe(232);
    expect(actualDigests).toEqual(expectedOtelReconstructionDigests);
  });
});

// use this to update the expected mapping result when changing/fixing the mapping logic
const updateExpectedFilesOnFailure = false;

describe("ChatML adaption tests against real observations", () => {
  it.each(traceFiles)(
    "should adapt observations from trace file %s ",
    (traceFile: string) => {
      //load trace file
      const fileDir = path.resolve(__dirname, "framework-traces");
      const traceFilePath = path.join(fileDir, traceFile);
      const traceContent = readFileSync(traceFilePath, "utf-8");
      const observations = JSON.parse(traceContent).observations;

      //load expected file
      const expectedFile = traceFile.replace(/\.trace\.json$/, ".chatml.json");
      const expectedFilePath = path.join(fileDir, expectedFile);

      //in update mode, create the chatML file is needed
      if (updateExpectedFilesOnFailure && !existsSync(expectedFilePath)) {
        writeFileSync(expectedFilePath, JSON.stringify({}, null, 2), "utf-8");
      }
      let errorMessage = `File ${expectedFilePath} should exist`;
      expect(existsSync(expectedFilePath), errorMessage).toBe(true);

      const expectedContent = readFileSync(expectedFilePath, "utf-8");
      const expected = JSON.parse(expectedContent) as Record<
        string,
        {
          input?: ReturnType<typeof ChatMlArraySchema.safeParse>;
          output?: ReturnType<typeof ChatMlArraySchema.safeParse>;
        }
      >;

      //check if data has at least one observation with a non undefined input
      errorMessage = `File should have at least one observation with input and output`;
      const hasFilledObs = observations.some((o: any) => o.input && o.output);
      expect(hasFilledObs, errorMessage).toBe(true);

      //test each observation with an input and/or output
      for (const obs of observations) {
        if (obs.input) {
          const expectedInput = expected[obs.id]?.input;
          if (!updateExpectedFilesOnFailure) {
            errorMessage = `Observation ${obs.id} should have an expected input`;
            expect(expectedInput, errorMessage).not.toBeUndefined();
          }

          const inResult = normalizeInput(deepParseJson(obs.input), {
            metadata: deepParseJson(obs.metadata),
            observationName: obs.name,
          });
          const normalizedInResult = JSON.parse(JSON.stringify(inResult));
          errorMessage = `Observation ${obs.id}'s input should be mapped as expected`;
          try {
            expect(normalizedInResult, errorMessage).toEqual(expectedInput);
          } catch (err) {
            if (updateExpectedFilesOnFailure)
              writeToExpectedFile(
                expectedFile,
                obs.id,
                "input",
                normalizedInResult,
              );
            else throw err;
          }
        }
        if (obs.output) {
          const expectedOutput = expected[obs.id]?.output;
          if (!updateExpectedFilesOnFailure) {
            errorMessage = `Observation ${obs.id} should have an expected output`;
            expect(expectedOutput, errorMessage).not.toBeUndefined();
          }

          const outResult = normalizeOutput(deepParseJson(obs.output), {
            metadata: deepParseJson(obs.metadata),
            observationName: obs.name,
          });
          const normalizedOutResult = JSON.parse(JSON.stringify(outResult));
          errorMessage = `Observation ${obs.id}'s output should be mapped as expected`;
          try {
            expect(normalizedOutResult, errorMessage).toEqual(expectedOutput);
          } catch (err) {
            if (updateExpectedFilesOnFailure)
              writeToExpectedFile(
                expectedFile,
                obs.id,
                "output",
                normalizedOutResult,
              );
            else throw err;
          }
        }
      }
    },
  );
});

/**
 * Helper function to write normalized input/output to expected file for a given observation ID and type (input/output).
 */
function writeToExpectedFile(
  expectedFileName: string,
  observationId: string,
  type: "input" | "output",
  data: any,
) {
  const fileDir = path.resolve(__dirname, "framework-traces");
  const expectedFilePath = path.join(fileDir, expectedFileName);

  let expected: Record<string, any> = {};
  if (existsSync(expectedFilePath)) {
    const expectedContent = readFileSync(expectedFilePath, "utf-8");
    expected = JSON.parse(expectedContent);
  } else {
    //create empty file
    writeFileSync(expectedFilePath, JSON.stringify({}, null, 2), "utf-8");
  }

  expected[observationId] = expected[observationId] || {};
  expected[observationId][type] = data;

  writeFileSync(expectedFilePath, JSON.stringify(expected, null, 2), "utf-8");
}
