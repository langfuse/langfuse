import { describe, expect, it } from "vitest";
import { compileChatMessages } from "./compileChatMessages";

function compile(value: string): string {
  return compileChatMessages(
    [{ role: "user", content: "Discount: {{discount}}" }],
    {},
    { discount: value },
  )[0].content as string;
}

describe("compileChatMessages text variables", () => {
  it.each(["$$100", "$&", "$`", "$'"])(
    "inserts %s literally instead of interpreting it as a replacement pattern",
    (value) => {
      expect(compile(value)).toBe(`Discount: ${value}`);
    },
  );
});
