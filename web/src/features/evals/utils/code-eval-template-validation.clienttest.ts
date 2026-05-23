import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  TYPESCRIPT_CODE_EVAL_CONTRACT,
  formatPythonCodeEvalSourceWithRuff,
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
    expect(
      getDefaultCodeEvalSource(EvalTemplateSourceCodeLanguage.TYPESCRIPT),
    ).toBe(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE);
    expect(
      getDefaultCodeEvalSource(EvalTemplateSourceCodeLanguage.PYTHON),
    ).toBe(DEFAULT_PYTHON_CODE_EVAL_SOURCE);
    expect(isDefaultCodeEvalSource(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE)).toBe(
      true,
    );
    expect(isDefaultCodeEvalSource(DEFAULT_PYTHON_CODE_EVAL_SOURCE)).toBe(true);
    expect(DEFAULT_PYTHON_CODE_EVAL_SOURCE).toMatch(
      /^from typing import Any, NotRequired, TypedDict/,
    );
    expect(DEFAULT_PYTHON_CODE_EVAL_SOURCE).toContain(
      "def evaluate(context: EvaluationContext) -> EvaluationResult:",
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
  });

  it("uses Ruff diagnostics for Python source", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: "def evaluate(ctx):\n    return missing_name\n",
      sourceCodeLanguage: EvalTemplateSourceCodeLanguage.PYTHON,
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("F821"),
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
