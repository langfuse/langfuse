import { parseOtelGenAiMessages } from "@langfuse/shared/src/server";

describe("parseOtelGenAiMessages", () => {
  describe("null and undefined handling", () => {
    it("should return null for null input", () => {
      expect(parseOtelGenAiMessages(null)).toBeNull();
    });

    it("should return undefined for undefined input", () => {
      expect(parseOtelGenAiMessages(undefined)).toBeUndefined();
    });
  });

  describe("string parsing", () => {
    it("should parse valid JSON string", () => {
      const input = '{"foo": "bar"}';
      expect(parseOtelGenAiMessages(input)).toEqual({ foo: "bar" });
    });

    it("should return original string for invalid JSON", () => {
      const input = "not valid json";
      expect(parseOtelGenAiMessages(input)).toBe(input);
    });

    it("should parse JSON array string", () => {
      const input = '[{"role": "user", "content": "Hello"}]';
      expect(parseOtelGenAiMessages(input)).toEqual([
        { role: "user", content: "Hello" },
      ]);
    });
  });

  describe("non-OTEL format passthrough", () => {
    it("should pass through already parsed non-OTEL array", () => {
      const input = [{ role: "user", content: "Hello" }];
      expect(parseOtelGenAiMessages(input)).toEqual(input);
    });

    it("should pass through non-array objects", () => {
      const input = { foo: "bar" };
      expect(parseOtelGenAiMessages(input)).toEqual(input);
    });
  });

  describe("OTEL format conversion - text parts", () => {
    it("should convert single text part to content string", () => {
      const input = [
        {
          role: "user",
          parts: [{ type: "text", content: "Hello world" }],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        { role: "user", content: "Hello world" },
      ]);
    });

    it("should convert multiple text parts to content array", () => {
      const input = [
        {
          role: "user",
          parts: [
            { type: "text", content: "Hello" },
            { type: "text", content: "World" },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "text", text: "World" },
          ],
        },
      ]);
    });

    it("should handle empty parts array", () => {
      const input = [
        {
          role: "assistant",
          parts: [],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        { role: "assistant", content: null },
      ]);
    });
  });

  describe("OTEL format conversion - tool calls", () => {
    it("should convert tool_call part to tool_calls array", () => {
      const input = [
        {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              id: "call_123",
              name: "get_weather",
              arguments: { city: "London" },
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"London"}',
              },
            },
          ],
        },
      ]);
    });

    it("should handle tool_call with string arguments", () => {
      const input = [
        {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              id: "call_456",
              name: "search",
              arguments: '{"query": "test"}',
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_456",
              type: "function",
              function: {
                name: "search",
                arguments: '{"query": "test"}',
              },
            },
          ],
        },
      ]);
    });

    it("should combine text content with tool calls", () => {
      const input = [
        {
          role: "assistant",
          parts: [
            { type: "text", content: "Let me check the weather" },
            {
              type: "tool_call",
              id: "call_789",
              name: "get_weather",
              arguments: {},
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "assistant",
          content: "Let me check the weather",
          tool_calls: [
            {
              id: "call_789",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{}",
              },
            },
          ],
        },
      ]);
    });
  });

  describe("OTEL format conversion - tool call responses", () => {
    it("should convert tool_call_response to tool message format", () => {
      const input = [
        {
          role: "tool",
          parts: [
            {
              type: "tool_call_response",
              id: "call_123",
              response: { temperature: 20, unit: "celsius" },
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "tool",
          tool_call_id: "call_123",
          content: '{"temperature":20,"unit":"celsius"}',
        },
      ]);
    });

    it("should handle string response in tool_call_response", () => {
      const input = [
        {
          role: "tool",
          parts: [
            {
              type: "tool_call_response",
              id: "call_456",
              response: "The weather is sunny",
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "tool",
          tool_call_id: "call_456",
          content: "The weather is sunny",
        },
      ]);
    });
  });

  describe("OTEL format conversion - media parts", () => {
    it("should convert blob part to image_url format", () => {
      const input = [
        {
          role: "user",
          parts: [
            {
              type: "blob",
              mime_type: "image/png",
              modality: "image",
              content: "base64data",
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,base64data" },
            },
          ],
        },
      ]);
    });

    it("should convert uri part with image modality to image_url format", () => {
      const input = [
        {
          role: "user",
          parts: [
            {
              type: "uri",
              modality: "image",
              uri: "https://example.com/image.png",
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "https://example.com/image.png" },
            },
          ],
        },
      ]);
    });

    it("should convert non-image uri part to uri format", () => {
      const input = [
        {
          role: "user",
          parts: [
            {
              type: "uri",
              modality: "audio",
              mime_type: "audio/mp3",
              uri: "https://example.com/audio.mp3",
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "user",
          content: [
            {
              type: "uri",
              uri: "https://example.com/audio.mp3",
              mime_type: "audio/mp3",
            },
          ],
        },
      ]);
    });

    it("should convert file part", () => {
      const input = [
        {
          role: "user",
          parts: [
            {
              type: "file",
              file_id: "file-abc123",
              modality: "image",
              mime_type: "image/jpeg",
            },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "user",
          content: [
            {
              type: "file",
              file_id: "file-abc123",
              mime_type: "image/jpeg",
            },
          ],
        },
      ]);
    });
  });

  describe("OTEL format conversion - reasoning parts", () => {
    it("should convert reasoning part", () => {
      const input = [
        {
          role: "assistant",
          parts: [
            { type: "reasoning", content: "Let me think about this..." },
            { type: "text", content: "The answer is 42" },
          ],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "assistant",
          content: [
            { type: "reasoning", content: "Let me think about this..." },
            { type: "text", text: "The answer is 42" },
          ],
        },
      ]);
    });
  });

  describe("OTEL format conversion - role normalization", () => {
    it('should normalize "model" role to "assistant"', () => {
      const input = [
        {
          role: "model",
          parts: [{ type: "text", content: "Hello" }],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        { role: "assistant", content: "Hello" },
      ]);
    });
  });

  describe("OTEL format conversion - name preservation", () => {
    it("should preserve message name", () => {
      const input = [
        {
          role: "user",
          name: "Alice",
          parts: [{ type: "text", content: "Hello" }],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        { role: "user", name: "Alice", content: "Hello" },
      ]);
    });
  });

  describe("mixed message formats", () => {
    it("should handle mixed OTEL and non-OTEL messages", () => {
      const input = [
        { role: "system", content: "You are helpful" },
        {
          role: "user",
          parts: [{ type: "text", content: "Hello" }],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ]);
    });
  });

  describe("JSON string input", () => {
    it("should parse and convert OTEL format from JSON string", () => {
      const input = JSON.stringify([
        {
          role: "user",
          parts: [{ type: "text", content: "Hello from JSON" }],
        },
      ]);
      expect(parseOtelGenAiMessages(input)).toEqual([
        { role: "user", content: "Hello from JSON" },
      ]);
    });
  });

  describe("generic parts", () => {
    it("should pass through unknown part types", () => {
      const input = [
        {
          role: "user",
          parts: [{ type: "custom_part", data: "some data", extra: 123 }],
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "user",
          content: [{ type: "custom_part", data: "some data", extra: 123 }],
        },
      ]);
    });
  });

  describe("additional properties", () => {
    it("should preserve additional properties on messages", () => {
      const input = [
        {
          role: "user",
          parts: [{ type: "text", content: "Hello" }],
          custom_field: "custom_value",
          metadata: { key: "value" },
        },
      ];
      expect(parseOtelGenAiMessages(input)).toEqual([
        {
          role: "user",
          content: "Hello",
          custom_field: "custom_value",
          metadata: { key: "value" },
        },
      ]);
    });
  });
});
