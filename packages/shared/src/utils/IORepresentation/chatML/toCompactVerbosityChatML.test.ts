import { describe, expect, it } from "vitest";

import { toCompactVerbosityChatML } from "./toCompactVerbosityChatML";

// ──────────────────────────────────────────────────────────────────────────────
// 1. BASE CASES — Core contract: each code path returns the expected shape
// ──────────────────────────────────────────────────────────────────────────────
describe("Base Cases — core contract", () => {
  describe("Case 0: Falsy / non-chatml inputs", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["empty string", ""],
      ["zero", 0],
      ["false", false],
    ])("returns { success: false, data: null } for %s", (_label, input) => {
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: false,
        data: null,
      });
    });
  });

  describe("Case 1: Direct array", () => {
    it("extracts last message content from [{role, content}]", () => {
      const input = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '"Hi there!"',
      });
    });

    it("returns false for empty array", () => {
      expect(toCompactVerbosityChatML([])).toEqual({
        success: false,
        data: null,
      });
    });

    it("returns false for array of non-ChatML objects", () => {
      expect(toCompactVerbosityChatML([{ foo: 1 }, { bar: 2 }])).toEqual({
        success: false,
        data: null,
      });
    });
  });

  describe("Case 2: Single message object", () => {
    it("extracts content from {role, content}", () => {
      expect(
        toCompactVerbosityChatML({ role: "assistant", content: "Hello!" }),
      ).toEqual({ success: true, data: '"Hello!"' });
    });

    it("returns false when role is missing", () => {
      expect(toCompactVerbosityChatML({ content: "Hello" })).toEqual({
        success: false,
        data: null,
      });
    });

    it("returns false when role is not a string", () => {
      expect(
        toCompactVerbosityChatML({ role: 123, content: "Hello" }),
      ).toEqual({ success: false, data: null });
    });
  });

  describe("Case 3: Messages wrapper", () => {
    it("extracts last message from {messages: [{role, content}]}", () => {
      const input = {
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
        ],
      };
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '"Hello!"',
      });
    });

    it("returns false for empty messages array", () => {
      expect(toCompactVerbosityChatML({ messages: [] })).toEqual({
        success: false,
        data: null,
      });
    });

    it("returns false when messages is not an array", () => {
      expect(toCompactVerbosityChatML({ messages: "not an array" })).toEqual({
        success: false,
        data: null,
      });
    });

    it("returns false when messages contains invalid objects", () => {
      expect(toCompactVerbosityChatML({ messages: [1, 2, 3] })).toEqual({
        success: false,
        data: null,
      });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. NORMAL CASES — Realistic payloads
// ──────────────────────────────────────────────────────────────────────────────
describe("Normal Cases — realistic payloads", () => {
  it("handles OpenAI-style content array in content field", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here is the answer: " },
          { type: "text", text: "42" },
        ],
      },
    ];
    expect(toCompactVerbosityChatML(input)).toEqual({
      success: true,
      data: '[{"type":"text","text":"Here is the answer: "},{"type":"text","text":"42"}]',
    });
  });

  it("handles content as structured object", () => {
    const input = [{ role: "assistant", content: { key: "value" } }];
    expect(toCompactVerbosityChatML(input)).toEqual({
      success: true,
      data: '{"key":"value"}',
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. EDGE CASES — Boundary conditions and special values
// ──────────────────────────────────────────────────────────────────────────────
describe("Edge Cases — boundary conditions", () => {
  describe("null content handling", () => {
    it("JSON.stringify(null) returns 'null' string — expected behavior", () => {
      const input = [{ role: "assistant", content: null }];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: "null",
      });
    });

    it("returns null for content: null, no parts, in single message", () => {
      expect(
        toCompactVerbosityChatML({ role: "assistant", content: null }),
      ).toEqual({ success: true, data: null });
    });

    it("returns null for tool call messages with null content and no parts", () => {
      const input = [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: { name: "get_weather", arguments: "{}" },
            },
          ],
        },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe("single-element arrays", () => {
    it("handles single user message", () => {
      expect(
        toCompactVerbosityChatML([{ role: "user", content: "Hello" }]),
      ).toEqual({ success: true, data: '"Hello"' });
    });
  });

  describe("Unicode and special characters", () => {
    it("handles emoji in content", () => {
      expect(
        toCompactVerbosityChatML([
          { role: "assistant", content: "Hello 🌍!" },
        ]),
      ).toEqual({ success: true, data: '"Hello 🌍!"' });
    });

    it("handles newlines and tabs in content", () => {
      expect(
        toCompactVerbosityChatML([
          { role: "assistant", content: "Line 1\nLine 2\tTabbed" },
        ]),
      ).toEqual({ success: true, data: '"Line 1\\nLine 2\\tTabbed"' });
    });

    it("handles quotes and backslashes in content", () => {
      expect(
        toCompactVerbosityChatML([
          { role: "assistant", content: 'She said "hello" and \\n' },
        ]),
      ).toEqual({
        success: true,
        data: '"She said \\"hello\\" and \\\\n"',
      });
    });

    it("handles CJK characters", () => {
      expect(
        toCompactVerbosityChatML([
          { role: "assistant", content: "你好世界" },
        ]),
      ).toEqual({ success: true, data: '"你好世界"' });
    });
  });

  describe("content type variations", () => {
    it("handles content as empty string", () => {
      expect(
        toCompactVerbosityChatML([{ role: "assistant", content: "" }]),
      ).toEqual({ success: true, data: '""' });
    });

    it("handles content as nested object", () => {
      const input = [
        {
          role: "assistant",
          content: { nested: { deep: { value: 123 } } },
        },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '{"nested":{"deep":{"value":123}}}',
      });
    });

    it("handles content as array of strings", () => {
      expect(
        toCompactVerbosityChatML([
          { role: "assistant", content: ["line1", "line2"] },
        ]),
      ).toEqual({ success: true, data: '["line1","line2"]' });
    });

    it("number content fails schema validation (not string/array/record)", () => {
      expect(
        toCompactVerbosityChatML([{ role: "assistant", content: 42 }]),
      ).toEqual({ success: false, data: null });
    });

    it("boolean content fails schema validation (not string/array/record)", () => {
      expect(
        toCompactVerbosityChatML([{ role: "assistant", content: true }]),
      ).toEqual({ success: false, data: null });
    });
  });

  describe("extra fields on messages", () => {
    it("ignores extra fields like tool_calls, name, etc.", () => {
      const input = [
        {
          role: "assistant",
          content: "Hello",
          name: "gpt-4",
          tool_calls: [{ id: "1", name: "func", arguments: "{}" }],
          additional_kwargs: { foo: "bar" },
        },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '"Hello"',
      });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. OUTLIER CASES — Unusual, adversarial, or extreme inputs
// ──────────────────────────────────────────────────────────────────────────────
describe("Outlier Cases — unusual and adversarial inputs", () => {
  describe("malformed structures", () => {
    it("returns false for string input", () => {
      expect(toCompactVerbosityChatML("not an object")).toEqual({
        success: false,
        data: null,
      });
    });

    it("returns false for number input", () => {
      expect(toCompactVerbosityChatML(42)).toEqual({
        success: false,
        data: null,
      });
    });

    it("returns false for array of primitives", () => {
      expect(toCompactVerbosityChatML([1, 2, 3])).toEqual({
        success: false,
        data: null,
      });
    });

    it("returns false for object without role", () => {
      expect(toCompactVerbosityChatML({ content: "Hello" })).toEqual({
        success: false,
        data: null,
      });
    });
  });

  describe("very large payloads", () => {
    it("handles a long conversation (50 messages)", () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
      }));
      expect(toCompactVerbosityChatML(messages)).toEqual({
        success: true,
        data: '"Message 49"',
      });
    });

    it("handles very long content string", () => {
      const longContent = "a".repeat(100_000);
      const input = [{ role: "assistant", content: longContent }];
      const result = toCompactVerbosityChatML(input);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThan(100_000);
    });
  });

  describe("deeply nested structures", () => {
    it("handles deeply nested content object (20 levels)", () => {
      let nested: Record<string, unknown> = { value: "deep" };
      for (let i = 0; i < 20; i++) {
        nested = { level: i, child: nested };
      }
      const input = [{ role: "assistant", content: nested }];
      const result = toCompactVerbosityChatML(input);
      expect(result.success).toBe(true);
      expect(result.data).toContain("deep");
    });
  });

  describe("empty and sparse structures", () => {
    it("handles content as empty object", () => {
      expect(
        toCompactVerbosityChatML([{ role: "assistant", content: {} }]),
      ).toEqual({ success: true, data: "{}" });
    });

    it("handles content as empty array", () => {
      expect(
        toCompactVerbosityChatML([{ role: "assistant", content: [] }]),
      ).toEqual({ success: true, data: "[]" });
    });
  });

  describe("multiple messages — always extracts from last", () => {
    it("always extracts from last message", () => {
      const input = [
        { role: "assistant", content: "First" },
        { role: "assistant", content: "Second" },
        { role: "assistant", content: "Third (last)" },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '"Third (last)"',
      });
    });
  });

  describe("non-standard roles", () => {
    it("handles 'system' role", () => {
      expect(
        toCompactVerbosityChatML([
          { role: "system", content: "You are helpful" },
        ]),
      ).toEqual({ success: true, data: '"You are helpful"' });
    });

    it("handles 'human'/'ai' roles (LangChain)", () => {
      expect(
        toCompactVerbosityChatML([{ role: "human", content: "Hi" }]),
      ).toEqual({ success: true, data: '"Hi"' });
    });

    it("handles custom role strings", () => {
      expect(
        toCompactVerbosityChatML([
          { role: "custom_role", content: "Hello" },
        ]),
      ).toEqual({ success: true, data: '"Hello"' });
    });
  });

  describe("error resilience", () => {
    it("does not throw on any input", () => {
      const weirdInputs = [
        Symbol("test"),
        new Date(),
        /regex/,
        new Map(),
        new Set(),
        () => {},
        class {},
      ];
      for (const input of weirdInputs) {
        expect(() => toCompactVerbosityChatML(input)).not.toThrow();
        expect(toCompactVerbosityChatML(input)).toEqual({
          success: false,
          data: null,
        });
      }
    });
  });
});
