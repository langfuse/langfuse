import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  TYPESCRIPT_CODE_EVAL_CONTRACT,
  formatAndStripCodeEvalSourceForSubmit,
  formatPythonCodeEvalSourceWithRuff,
  getCodeEvalSourceForEditor,
  getDefaultCodeEvalSource,
  isDefaultCodeEvalSource,
  validateCodeEvalSourceWithLanguage,
} from "@/src/features/evals/utils/code-eval-template-validation";

vi.mock("@astral-sh/ruff-wasm-web", () => ({
  default: async () => ({}),
  PositionEncoding: { Utf16: 1 },
  Workspace: class {
    check(contents: string) {
      if (!contents.includes("missing_name")) return [];

      return [
        {
          code: "F821",
          message: "Undefined name `missing_name`",
          start_location: { row: 2, column: 12 },
          end_location: { row: 2, column: 24 },
          fix: null,
        },
      ];
    }

    format(contents: string) {
      return contents
        .replace(" return", "    return")
        .replace("{'scores':[]}", '{"scores": []}');
    }
  },
}));

describe("code eval template validation", () => {
  it("keeps language defaults distinct", () => {
    expect(getDefaultCodeEvalSource("TYPESCRIPT")).toBe(
      DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
    );
    expect(getDefaultCodeEvalSource("PYTHON")).toBe(
      DEFAULT_PYTHON_CODE_EVAL_SOURCE,
    );
    expect(isDefaultCodeEvalSource(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE)).toBe(
      true,
    );
    expect(isDefaultCodeEvalSource(DEFAULT_PYTHON_CODE_EVAL_SOURCE)).toBe(true);
    expect(DEFAULT_PYTHON_CODE_EVAL_SOURCE).toMatch(
      /^from dataclasses import dataclass/,
    );
    expect(DEFAULT_PYTHON_CODE_EVAL_SOURCE).toContain(
      "def evaluate(ctx: EvaluationContext) -> EvaluationResult:",
    );
    expect(
      DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE.startsWith(
        TYPESCRIPT_CODE_EVAL_CONTRACT,
      ),
    ).toBe(true);
    expect(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE).toContain(
      "type EvaluationContext =",
    );
    expect(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE).toContain(
      "type EvaluationResult =",
    );
    expect(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE).toContain(
      "function evaluate(ctx: EvaluationContext): EvaluationResult",
    );
  });

  it("strips editor-only contracts before submit", async () => {
    expect(
      await formatAndStripCodeEvalSourceForSubmit({
        sourceCode: DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
        sourceCodeLanguage: "TYPESCRIPT",
      }),
    ).toContain("function evaluate(ctx: EvaluationContext): EvaluationResult");
    expect(
      await formatAndStripCodeEvalSourceForSubmit({
        sourceCode: DEFAULT_PYTHON_CODE_EVAL_SOURCE,
        sourceCodeLanguage: "PYTHON",
      }),
    ).toMatch(/^def evaluate\(ctx: EvaluationContext\)/);
  });

  it("rehydrates stored evaluator functions for the editor", () => {
    const source =
      "function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [] }; }";

    expect(
      getCodeEvalSourceForEditor({
        sourceCode: source,
        sourceCodeLanguage: "TYPESCRIPT",
      }),
    ).toContain(TYPESCRIPT_CODE_EVAL_CONTRACT);
  });

  it("accepts the default TypeScript source", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("accepts async TypeScript evaluate functions with timers", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
async function evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const allValues = await Promise.all([Promise.resolve(1), Promise.resolve(2)]);
  const settled = await Promise.allSettled([Promise.resolve("ok"), Promise.reject("no")]);
  const raced = await Promise.race([Promise.resolve(3)]);
  const anyValue = await Promise.any([Promise.reject("no"), Promise.resolve(4)]);

  return {
    scores: [{
      name: "async helpers",
      value: allValues[0] + allValues[1] + settled.length + raced + anyValue,
      dataType: "NUMERIC",
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("accepts simple Node runtime globals and keeps process unavailable", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const encoded = new TextEncoder().encode(new URL("https://langfuse.com").hostname);
  const sliced = encoded.slice(0, 4).subarray(0, 2);
  let byteTotal = 0;
  sliced.forEach((value) => {
    byteTotal = byteTotal + value;
  });
  const copy = structuredClone({ length: encoded.length });
  queueMicrotask(() => {});

  return { scores: [{ name: "encoded", value: copy.length + byteTotal, dataType: "NUMERIC" }] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);

    const processResult = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  return { scores: [{ name: "env", value: process.env.NODE_ENV ?? "", dataType: "TEXT" }] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(processResult.hasErrors).toBe(true);
    expect(
      processResult.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Cannot find name 'process'"),
      ),
    ).toBe(true);
  });

  it("rejects exported TypeScript evaluate functions", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
export function evaluate(ctx: EvaluationContext): EvaluationResult {
  return { scores: [] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Exports are not supported"),
      ),
    ).toBe(true);
  });

  it("uses Ruff diagnostics for Python source", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: "def evaluate(ctx):\n    return missing_name\n",
      sourceCodeLanguage: "PYTHON",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("F821"),
      ),
    ).toBe(true);
  });

  it("rejects default exported TypeScript evaluate functions", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
export default function evaluate(): EvaluationResult {
  return { scores: [] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Exports are not supported"),
      ),
    ).toBe(true);
  });

  it("formats Python source with Ruff", async () => {
    await expect(
      formatPythonCodeEvalSourceWithRuff(
        "def evaluate(ctx):\n return {'scores':[]}\n",
      ),
    ).resolves.toContain('"scores": []');
  });
});
