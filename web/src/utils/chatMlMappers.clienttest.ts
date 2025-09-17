import {
  mapToChatMl,
  mapOutputToChatMl,
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
} from "./chatMlMappers";

describe("chatMlMappers", () => {
  describe("mapToChatMl", () => {
    it("should parse direct ChatML array format", () => {
      const input = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]).toMatchObject({
          role: "system",
          content: "You are a helpful assistant.",
        });
        expect(result.data[1]).toMatchObject({
          role: "user",
          content: "Hello!",
        });
      }
    });

    it("should parse nested array format [[ChatML...]]", () => {
      const input = [
        [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
        ],
      ];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].role).toBe("system");
        expect(result.data[1].role).toBe("user");
      }
    });

    it("should parse object with messages key {messages: [ChatML...]}", () => {
      const input = {
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
        ],
        temperature: 0.7,
        model: "gpt-4",
      };

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].role).toBe("system");
        expect(result.data[1].role).toBe("user");
      }
    });

    it("should fail gracefully for invalid input", () => {
      const input = "not a valid format";

      const result = mapToChatMl(input);

      expect(result.success).toBe(false);
    });

    it("should fail gracefully for empty input", () => {
      const result = mapToChatMl(null);

      expect(result.success).toBe(false);
    });

    it("should handle complex message structures with additional fields", () => {
      const input = [
        {
          role: "system",
          content: "You are a helpful assistant.",
          name: "system",
        },
        {
          role: "user",
          content: "Hello!",
          additional_kwargs: { custom_field: "value" },
        },
        {
          role: "assistant",
          content: "Hi there!",
          json: { metadata: "extra data" },
        },
      ];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0].name).toBe("system");
        // ChatML schema transforms extra fields - expecting actual behavior
        expect(result.data[2].json).toEqual({
          json: { metadata: "extra data" },
        });
      }
    });

    it("should handle OpenAI content parts format", () => {
      const input = [
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
      ];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(Array.isArray(result.data[0].content)).toBe(true);
      }
    });

    it("should handle tool call messages", () => {
      const input = [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: { name: "get_weather", arguments: '{"city": "NYC"}' },
            },
          ],
        },
        {
          role: "tool",
          content: '{"temperature": 72}',
          tool_call_id: "call_123",
        },
      ];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].role).toBe("assistant");
        expect(result.data[1].role).toBe("tool");
      }
    });

    it("should handle placeholder messages", () => {
      const input = [
        {
          role: "user",
          content: "Hello",
        },
        {
          type: "placeholder",
          name: "Processing...",
        },
        {
          role: "assistant",
          content: "Hi there!",
        },
      ];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[1].type).toBe("placeholder");
      }
    });
  });

  describe("mapOutputToChatMl", () => {
    it("should parse direct output array", () => {
      const output = [{ role: "assistant", content: "Hello there!" }];

      const result = mapOutputToChatMl(output);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].role).toBe("assistant");
      }
    });

    it("should parse single output object as array", () => {
      const output = { role: "assistant", content: "Hello there!" };

      const result = mapOutputToChatMl(output);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].role).toBe("assistant");
      }
    });

    it("should handle legacy completion format {completion: string}", () => {
      const output = { completion: "This is a legacy completion response" };

      const result = mapOutputToChatMl(output);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        // ChatML schema transforms the object, putting extra fields in json
        expect(result.data[0]).toEqual({
          audio: undefined,
          content: undefined,
          json: { completion: "This is a legacy completion response" },
          name: undefined,
          role: undefined,
          type: undefined,
        });
      }
    });

    it("should handle string output", () => {
      const output = "Simple string response";

      const result = mapOutputToChatMl(output);

      // Strings don't pass ChatML validation - this is expected behavior
      expect(result.success).toBe(false);
    });

    it("should handle complex output with metadata", () => {
      const output = {
        role: "assistant",
        content: "Response with metadata",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };

      const result = mapOutputToChatMl(output);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].role).toBe("assistant");
        expect(result.data[0].json).toEqual({
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      }
    });

    it("should handle null/undefined output", () => {
      const result1 = mapOutputToChatMl(null);
      const result2 = mapOutputToChatMl(undefined);

      // null/undefined don't pass ChatML validation - this is expected behavior
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle deeply nested invalid structures", () => {
      const input = {
        messages: {
          nested: {
            deeply: "invalid structure",
          },
        },
      };

      const result = mapToChatMl(input);

      expect(result.success).toBe(false);
    });

    it("should handle circular references gracefully", () => {
      const input: any = { role: "user", content: "test" };
      input.circular = input;

      // Should not crash, though parsing may fail
      expect(() => mapToChatMl([input])).not.toThrow();
    });

    it("should handle very large inputs", () => {
      const largeContent = "x".repeat(100000);
      const input = [{ role: "user", content: largeContent }];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].content).toHaveLength(100000);
      }
    });

    it("should preserve all original data in json field for complex objects", () => {
      const input = [
        {
          role: "assistant",
          content: "Response",
          model: "gpt-4",
          temperature: 0.7,
          custom_metadata: { key: "value" },
          additional_kwargs: { extra: "data" },
        },
      ];

      const result = mapToChatMl(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].json).toEqual({
          model: "gpt-4",
          temperature: 0.7,
          custom_metadata: { key: "value" },
          extra: "data", // additional_kwargs gets flattened
        });
      }
    });
  });

  describe("cleanLegacyOutput", () => {
    it("should clean legacy completion format", () => {
      const output = { completion: "This is a legacy completion response" };
      const result = cleanLegacyOutput(output, "fallback");

      expect(result).toEqual({
        completion: "This is a legacy completion response",
      });
    });

    it("should return fallback for non-legacy format", () => {
      const output = { role: "assistant", content: "Regular response" };
      const fallback = "fallback value";
      const result = cleanLegacyOutput(output, fallback);

      expect(result).toBe(fallback);
    });

    it("should handle null/undefined output", () => {
      const fallback = "fallback value";
      expect(cleanLegacyOutput(null, fallback)).toBe(fallback);
      expect(cleanLegacyOutput(undefined, fallback)).toBe(fallback);
    });
  });

  describe("extractAdditionalInput", () => {
    it("should extract additional fields from object", () => {
      const input = {
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        model: "gpt-4",
        custom_param: "value",
      };

      const result = extractAdditionalInput(input);

      expect(result).toEqual({
        temperature: 0.7,
        model: "gpt-4",
        custom_param: "value",
      });
    });

    it("should return undefined for array input", () => {
      const input = [{ role: "user", content: "Hello" }];
      const result = extractAdditionalInput(input);

      expect(result).toBeUndefined();
    });

    it("should return undefined for non-object input", () => {
      expect(extractAdditionalInput("string")).toBeUndefined();
      expect(extractAdditionalInput(42)).toBeUndefined();
      expect(extractAdditionalInput(null)).toBeUndefined();
    });

    it("should return empty object when only messages field present", () => {
      const input = { messages: [{ role: "user", content: "Hello" }] };
      const result = extractAdditionalInput(input);

      expect(result).toEqual({});
    });
  });

  describe("combineInputOutputMessages", () => {
    it("should combine successful input and output", () => {
      const inputResult = {
        success: true,
        data: [{ role: "user", content: "Hello" }],
      } as any;
      const outputResult = {
        success: true,
        data: [{ content: "Hi there!" }],
      } as any;
      const cleanOutput = "fallback";

      const result = combineInputOutputMessages(
        inputResult,
        outputResult,
        cleanOutput,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: "user", content: "Hello" });
      expect(result[1]).toEqual({ content: "Hi there!", role: "assistant" }); // role gets defaulted
    });

    it("should handle failed output with string fallback", () => {
      const inputResult = {
        success: true,
        data: [{ role: "user", content: "Hello" }],
      } as any;
      const outputResult = { success: false, error: "error" } as any;
      const cleanOutput = "String response";

      const result = combineInputOutputMessages(
        inputResult,
        outputResult,
        cleanOutput,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: "user", content: "Hello" });
      expect(result[1]).toEqual({
        role: "assistant",
        content: "String response",
      });
    });

    it("should handle failed output with object fallback", () => {
      const inputResult = {
        success: true,
        data: [{ role: "user", content: "Hello" }],
      } as any;
      const outputResult = { success: false, error: "error" } as any;
      const cleanOutput = { metadata: "extra info" };

      const result = combineInputOutputMessages(
        inputResult,
        outputResult,
        cleanOutput,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: "user", content: "Hello" });
      expect(result[1]).toEqual({
        role: "assistant",
        json: { metadata: "extra info" },
      });
    });

    it("should warn when called with failed input parsing", () => {
      const inputResult = { success: false, error: "error" } as any;
      const outputResult = { success: true, data: [{ content: "Hi" }] } as any;
      const cleanOutput = "fallback";

      // Should not crash even with failed input
      expect(() =>
        combineInputOutputMessages(inputResult, outputResult, cleanOutput),
      ).not.toThrow();
    });
  });
});
