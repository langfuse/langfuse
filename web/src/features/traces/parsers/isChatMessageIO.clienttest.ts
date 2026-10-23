import { describe, expect, it } from "vitest";
import { isChatMessageIO } from "./isChatMessageIO";

describe("isChatMessageIO", () => {
  it.each([
    [
      "role-tagged array",
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    ],
    ["wrapped messages", { messages: [{ role: "user", content: "hello" }] }],
    ["single message", { role: "assistant", content: "sure" }],
    [
      "one tagged entry among untagged",
      [{ text: "loose" }, { role: "user", content: "hello" }],
    ],
  ])("treats %s as chat", (_name, value) => {
    expect(isChatMessageIO(value)).toBe(true);
  });

  it.each([
    ["plain string", "Summarize this."],
    ["record without role", { question: "Which plans include SSO?" }],
    ["array without roles", [{ text: "a" }, { text: "b" }]],
    ["role that is not a string", [{ role: 1, content: "x" }]],
    ["empty messages", { messages: [] }],
    ["null", null],
    ["undefined", undefined],
  ])("treats %s as non-chat", (_name, value) => {
    expect(isChatMessageIO(value)).toBe(false);
  });
});
