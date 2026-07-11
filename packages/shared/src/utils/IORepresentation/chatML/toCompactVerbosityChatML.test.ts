import { describe, expect, it } from "vitest";

import { toCompactVerbosityChatML } from "./toCompactVerbosityChatML";

describe("toCompactVerbosityChatML", () => {
  describe("standard ChatML messages", () => {
    it("returns null for falsy input", () => {
      expect(toCompactVerbosityChatML(null)).toEqual({
        success: false,
        data: null,
      });
      expect(toCompactVerbosityChatML(undefined)).toEqual({
        success: false,
        data: null,
      });
      expect(toCompactVerbosityChatML("")).toEqual({
        success: false,
        data: null,
      });
    });

    it("extracts last message content from direct array", () => {
      const input = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '"Hi there!"',
      });
    });

    it("extracts content from single message object", () => {
      const input = { role: "assistant", content: "Hello!" };
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '"Hello!"',
      });
    });

    it("extracts content from messages wrapper", () => {
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

    it("handles content as array of parts", () => {
      const input = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world!" },
          ],
        },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '[{"type":"text","text":"Hello "},{"type":"text","text":"world!"}]',
      });
    });

    it("returns null for non-ChatML data", () => {
      expect(toCompactVerbosityChatML({ foo: "bar" })).toEqual({
        success: false,
        data: null,
      });
      expect(toCompactVerbosityChatML([1, 2, 3])).toEqual({
        success: false,
        data: null,
      });
    });
  });

  describe("AI SDK v7 { role, parts } messages", () => {
    it("extracts last message content from array with parts", () => {
      const input = [
        { role: "user", content: "Hello" },
        { role: "assistant", parts: [{ type: "text", content: "Hi there!" }] },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '[{"type":"text","content":"Hi there!"}]',
      });
    });

    it("extracts content from single message with parts", () => {
      const input = {
        role: "assistant",
        parts: [{ type: "text", content: "Hello!" }],
      };
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '[{"type":"text","content":"Hello!"}]',
      });
    });

    it("extracts content from messages wrapper with parts", () => {
      const input = {
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", parts: [{ type: "text", content: "Hello!" }] },
        ],
      };
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '[{"type":"text","content":"Hello!"}]',
      });
    });

    it("prefers content over parts when both exist", () => {
      const input = [
        {
          role: "assistant",
          content: "Preferred content",
          parts: [{ type: "text", content: "Parts content" }],
        },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '"Preferred content"',
      });
    });

    it("handles multiple parts in last message", () => {
      const input = [
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          parts: [
            { type: "text", content: "First part" },
            { type: "text", content: "Second part" },
          ],
        },
      ];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: '[{"type":"text","content":"First part"},{"type":"text","content":"Second part"}]',
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty array", () => {
      expect(toCompactVerbosityChatML([])).toEqual({
        success: false,
        data: null,
      });
    });

    it("handles message with null content", () => {
      const input = [{ role: "assistant", content: null }];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: true,
        data: "null",
      });
    });

    it("handles message with undefined content and parts", () => {
      const input = [{ role: "assistant" }];
      expect(toCompactVerbosityChatML(input)).toEqual({
        success: false,
        data: null,
      });
    });

    it("handles tool call messages", () => {
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
        data: "null",
      });
    });
  });
});
