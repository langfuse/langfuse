import { describe, expect, it } from "vitest";
import { toCompactVerbosityChatML } from "./toCompactVerbosityChatML";

describe("toCompactVerbosityChatML", () => {
  describe("standard content field", () => {
    it("returns last message content from a direct array", () => {
      const result = toCompactVerbosityChatML([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ]);
      expect(result).toEqual({ success: true, data: '"Hi there"' });
    });

    it("returns content from a single message object", () => {
      const result = toCompactVerbosityChatML({
        role: "assistant",
        content: "Hello",
      });
      expect(result).toEqual({ success: true, data: '"Hello"' });
    });

    it("returns last message content from a messages-wrapper object", () => {
      const result = toCompactVerbosityChatML({
        messages: [
          { role: "user", content: "Ping" },
          { role: "assistant", content: "Pong" },
        ],
      });
      expect(result).toEqual({ success: true, data: '"Pong"' });
    });
  });

  describe("GenAI semantic-convention parts field (AI SDK v7)", () => {
    it("returns parts from the last message in a direct array when content is absent", () => {
      const parts = [{ type: "text", content: "Hello from parts" }];
      const result = toCompactVerbosityChatML([
        { role: "user", content: "Hi" },
        { role: "assistant", parts },
      ]);
      expect(result).toEqual({ success: true, data: JSON.stringify(parts) });
    });

    it("returns parts from a single message object when content is absent", () => {
      const parts = [{ type: "text", content: "Streamed response" }];
      const result = toCompactVerbosityChatML({ role: "assistant", parts });
      expect(result).toEqual({ success: true, data: JSON.stringify(parts) });
    });

    it("returns parts from the last message in a messages-wrapper when content is absent", () => {
      const parts = [{ type: "text", content: "Final answer" }];
      const result = toCompactVerbosityChatML({
        messages: [
          { role: "user", content: "Question" },
          { role: "assistant", parts },
        ],
      });
      expect(result).toEqual({ success: true, data: JSON.stringify(parts) });
    });

    it("prefers content over parts when both are present", () => {
      const result = toCompactVerbosityChatML([
        {
          role: "assistant",
          content: "from content",
          parts: [{ type: "text", content: "from parts" }],
        },
      ]);
      expect(result).toEqual({ success: true, data: '"from content"' });
    });
  });

  describe("edge cases", () => {
    it("returns failure for null input", () => {
      const result = toCompactVerbosityChatML(null);
      expect(result).toEqual({ success: false, data: null });
    });

    it("returns failure for a plain string", () => {
      const result = toCompactVerbosityChatML("just a string");
      expect(result).toEqual({ success: false, data: null });
    });

    it("returns failure for an empty array", () => {
      const result = toCompactVerbosityChatML([]);
      expect(result).toEqual({ success: false, data: null });
    });

    it("returns data: null when last message has neither content nor parts", () => {
      const result = toCompactVerbosityChatML([{ role: "assistant" }]);
      expect(result).toEqual({ success: true, data: null });
    });
  });
});
