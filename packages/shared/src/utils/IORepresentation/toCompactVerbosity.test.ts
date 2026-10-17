import { describe, expect, it } from "vitest";

import { toCompactVerbosity } from "./toCompactVerbosity";

// ──────────────────────────────────────────────────────────────────────────────
// 1. BASE CASES — Core contract
// ──────────────────────────────────────────────────────────────────────────────
describe("Base Cases — core contract", () => {
  it("returns { success: false, data: null } for null", () => {
    expect(toCompactVerbosity(null)).toEqual({ success: false, data: null });
  });

  it("returns { success: false, data: null } for undefined", () => {
    expect(toCompactVerbosity(undefined)).toEqual({
      success: false,
      data: null,
    });
  });

  it("parses stringified JSON", () => {
    const input = JSON.stringify([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ]);
    expect(toCompactVerbosity(input)).toEqual({
      success: true,
      data: '"Hello!"',
    });
  });

  it("passes through non-JSON strings", () => {
    expect(toCompactVerbosity("not json at all")).toEqual({
      success: false,
      data: null,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. STANDARD CHATML — {role, content} messages
// ──────────────────────────────────────────────────────────────────────────────
describe("Standard ChatML — {role, content}", () => {
  it("extracts from direct array", () => {
    const input = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];
    expect(toCompactVerbosity(input)).toEqual({
      success: true,
      data: '"Hello!"',
    });
  });

  it("extracts from single message", () => {
    expect(
      toCompactVerbosity({ role: "assistant", content: "Hello!" }),
    ).toEqual({ success: true, data: '"Hello!"' });
  });

  it("extracts from messages wrapper", () => {
    expect(
      toCompactVerbosity({
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
        ],
      }),
    ).toEqual({ success: true, data: '"Hello!"' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. OTel GenAI {role, parts} — THE CORE FIX FOR #15000
// ──────────────────────────────────────────────────────────────────────────────
describe("OTel GenAI {role, parts} messages", () => {
  describe("direct array", () => {
    it("extracts text content from parts", () => {
      const input = [
        { role: "user", content: "Hello" },
        { role: "assistant", parts: [{ type: "text", content: "Hi there!" }] },
      ];
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"Hi there!"',
      });
    });

    it("handles multiple text parts — concatenates them", () => {
      const input = [
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          parts: [
            { type: "text", content: "First " },
            { type: "text", content: "second" },
          ],
        },
      ];
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"First second"',
      });
    });

    it("handles mixed part types — extracts only text parts", () => {
      const input = [
        {
          role: "assistant",
          parts: [
            { type: "text", content: "Hello" },
            { type: "tool_call", id: "call_1", name: "get_weather" },
            { type: "text", content: " after tool" },
          ],
        },
      ];
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"Hello after tool"',
      });
    });

    it("handles parts with non-text types only — falls through", () => {
      const input = [
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call_1", name: "get_weather" }],
        },
      ];
      // No text parts → parts not normalized → SimpleChatMessageSchema
      // accepts it (content is undefined via .nullish()) → returns null
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe("single message object", () => {
    it("extracts text from parts", () => {
      const input = {
        role: "assistant",
        parts: [{ type: "text", content: "Hello!" }],
      };
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"Hello!"',
      });
    });

    it("concatenates multiple text parts", () => {
      const input = {
        role: "assistant",
        parts: [
          { type: "text", content: "Hello " },
          { type: "text", content: "world!" },
        ],
      };
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"Hello world!"',
      });
    });
  });

  describe("messages wrapper", () => {
    it("extracts text from parts in messages wrapper", () => {
      const input = {
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", parts: [{ type: "text", content: "Hello!" }] },
        ],
      };
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"Hello!"',
      });
    });
  });

  describe("prefers content over parts when content is present", () => {
    it("does NOT normalize when content is already present", () => {
      const input = [
        {
          role: "assistant",
          content: "Preferred content",
          parts: [{ type: "text", content: "Ignored" }],
        },
      ];
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"Preferred content"',
      });
    });
  });

  describe("multi-turn with alternating formats", () => {
    it("always extracts from last message", () => {
      const input = [
        { role: "user", content: "Start" },
        { role: "assistant", content: "Traditional" },
        { role: "user", content: "Switch" },
        {
          role: "assistant",
          parts: [{ type: "text", content: "AI SDK v7" }],
        },
        { role: "user", content: "Back" },
        { role: "assistant", content: "Traditional again" },
      ];
      expect(toCompactVerbosity(input)).toEqual({
        success: true,
        data: '"Traditional again"',
      });
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. AI SDK v7 EXACT PAYLOAD — Bug report scenario
// ──────────────────────────────────────────────────────────────────────────────
describe("AI SDK v7 — exact bug report payload", () => {
  it("handles the exact payload from the bug report", () => {
    const input = [
      { role: "user", content: "Hi there" },
      {
        role: "assistant",
        parts: [{ type: "text", content: "Hello! How can I help?" }],
      },
    ];
    expect(toCompactVerbosity(input)).toEqual({
      success: true,
      data: '"Hello! How can I help?"',
    });
  });

  it("handles stringified version of the bug report payload", () => {
    const input = JSON.stringify([
      { role: "user", content: "Hi there" },
      {
        role: "assistant",
        parts: [{ type: "text", content: "Hello! How can I help?" }],
      },
    ]);
    expect(toCompactVerbosity(input)).toEqual({
      success: true,
      data: '"Hello! How can I help?"',
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. EDGE CASES — Boundary conditions
// ──────────────────────────────────────────────────────────────────────────────
describe("Edge Cases", () => {
  it("handles empty parts array", () => {
    const input = [{ role: "assistant", parts: [] }];
    expect(toCompactVerbosity(input)).toEqual({
      success: true,
      data: null,
    });
  });

  it("handles null content with parts — content is present so normalization does NOT trigger", () => {
    const input = [
      {
        role: "assistant",
        content: null,
        parts: [{ type: "text", content: "fallback" }],
      },
    ];
    // content:null is present → normalization skips → returns "null" string
    expect(toCompactVerbosity(input)).toEqual({
      success: true,
      data: "null",
    });
  });

  it("handles parts with non-string content field", () => {
    const input = [
      {
        role: "assistant",
        parts: [{ type: "text", content: 123 }],
      },
    ];
    // content is not a string → not extracted → falls through
    expect(toCompactVerbosity(input)).toEqual({
      success: true,
      data: null,
    });
  });

  it("handles very long parts content", () => {
    const longText = "a".repeat(50_000);
    const input = [
      {
        role: "assistant",
        parts: [{ type: "text", content: longText }],
      },
    ];
    const result = toCompactVerbosity(input);
    expect(result.success).toBe(true);
    expect(result.data).toBe(`"${longText}"`);
  });

  it("handles 50-message conversation with parts", () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", content: `Message ${i}` }],
    }));
    expect(toCompactVerbosity(messages)).toEqual({
      success: true,
      data: '"Message 49"',
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. OUTLIER CASES — Adversarial and unusual inputs
// ──────────────────────────────────────────────────────────────────────────────
describe("Outlier Cases", () => {
  it("handles non-array, non-object input", () => {
    expect(toCompactVerbosity(42)).toEqual({ success: false, data: null });
  });

  it("handles object without role", () => {
    expect(toCompactVerbosity({ content: "Hello" })).toEqual({
      success: false,
      data: null,
    });
  });

  it("does not throw on any input", () => {
    const weird = [Symbol("test"), new Date(), /regex/, new Map(), new Set()];
    for (const w of weird) {
      expect(() => toCompactVerbosity(w)).not.toThrow();
      expect(toCompactVerbosity(w)).toEqual({ success: false, data: null });
    }
  });
});
