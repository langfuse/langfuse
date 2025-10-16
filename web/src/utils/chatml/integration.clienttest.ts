jest.mock("@langfuse/shared", () => ({
  ChatMessageRole: {
    System: "system",
    Developer: "developer",
    User: "user",
    Assistant: "assistant",
    Tool: "tool",
    Model: "model",
  },
}));

import { normalizeInput, normalizeOutput } from "./adapters";
import {
  combineInputOutputMessages,
  cleanLegacyOutput,
  extractAdditionalInput,
} from "./core";

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
    expect(outResult.data[0].role).toBe("assistant");
    expect(outResult.data[0].content).toContain("Langfuse");

    expect(allMessages).toHaveLength(2);
    expect(allMessages[1].role).toBe("assistant");
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
    expect(inResult.data[2].role).toBe("assistant");
    expect(inResult.data[2].content).not.toContain("[object Object]");
    expect(inResult.data[3].role).toBe("user");
    expect(inResult.data[3].content).not.toContain("[object Object]");
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
    // Tool call should be preserved as structured content
    expect(Array.isArray(outResult.data[0].content)).toBe(true);
    expect(outResult.data[0].content).toEqual([
      {
        type: "tool_call",
        id: ["run_9guMCbt68iSVgtsx6WdKMA18", "call_Sz1QP8T7fuJkIECGDLFWOorq"],
        name: "get_weather",
        arguments: {
          location: "Portland",
        },
      },
    ]);

    expect(outResult.data[1].role).toBe("tool");
    expect(Array.isArray(outResult.data[1].content)).toBe(true);

    expect(outResult.data[2].role).toBe("assistant");
    expect(outResult.data[2].content).toBe(
      "The weather in Portland is currently stormy with a high temperature of 19°C.",
    );

    expect(allMessages).toHaveLength(4);
  });
});
