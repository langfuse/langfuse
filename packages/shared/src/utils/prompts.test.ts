import { describe, expect, it } from "vitest";
import { compileEvalPrompt, compileTemplateString } from "./prompts";

describe("compileTemplateString", () => {
  it("interpolates supported placeholders and preserves missing ones", () => {
    expect(
      compileTemplateString("Hello {{ name }}, {{user.score}} / {{missing}}", {
        name: "Ada",
        "user.score": 1,
      }),
    ).toBe("Hello Ada, 1 / {{missing}}");
  });

  it("uses the generic template string conversion behavior", () => {
    expect(
      compileTemplateString("{{object}} {{empty}}", {
        object: { score: 1 },
        empty: null,
      }),
    ).toBe("[object Object] ");
  });

  it("preserves placeholders named like Object.prototype members when not provided", () => {
    expect(
      compileTemplateString(
        "{{constructor}} {{toString}} {{hasOwnProperty}}",
        {},
      ),
    ).toBe("{{constructor}} {{toString}} {{hasOwnProperty}}");
  });

  it("interpolates a provided key even if it shadows a prototype member", () => {
    expect(compileTemplateString("{{toString}}", { toString: "ok" })).toBe(
      "ok",
    );
  });
});

describe("compileEvalPrompt", () => {
  it("serializes structured evaluator variables before interpolation", () => {
    expect(
      compileEvalPrompt({
        templatePrompt: "Input: {{input}}; missing: {{missing}}",
        variables: [{ var: "input", value: { question: "Hello" } }],
      }),
    ).toBe('Input: {"question":"Hello"}; missing: {{missing}}');
  });
});
