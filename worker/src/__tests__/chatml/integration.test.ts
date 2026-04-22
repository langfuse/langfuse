import { describe, it, expect, vi } from "vitest";
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
