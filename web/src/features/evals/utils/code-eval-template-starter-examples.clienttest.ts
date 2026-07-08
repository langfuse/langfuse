import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "@astral-sh/ruff-wasm-web";
import {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  formatAndStripCodeEvalSourceForSubmit,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";
import { validateCodeEvalSourceWithPython } from "@/src/features/evals/utils/code-eval-template-validation";

// This suite runs the real formatters (Prettier and the Ruff wasm build), so
// the starter sources are guaranteed to be format-canonical: clicking Format
// or submitting untouched starter code must not change it.
describe("code eval starter examples are format-canonical", () => {
  beforeAll(() => {
    // The web wasm build initializes itself via fetch(), which cannot load
    // file:// URLs in Node, so feed it the wasm bytes up front. Later init
    // calls in production code short-circuit once the wasm is loaded.
    const require = createRequire(import.meta.url);
    initSync({
      module: readFileSync(
        require.resolve("@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm"),
      ),
    });
  });

  it("keeps the default TypeScript source unchanged when formatted", async () => {
    await expect(
      formatAndStripCodeEvalSourceForSubmit({
        sourceCode: DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
        sourceCodeLanguage: "TYPESCRIPT",
      }),
    ).resolves.toBe(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE);
  });

  it("keeps the default Python source unchanged when formatted", async () => {
    await expect(
      formatAndStripCodeEvalSourceForSubmit({
        sourceCode: DEFAULT_PYTHON_CODE_EVAL_SOURCE,
        sourceCodeLanguage: "PYTHON",
      }),
    ).resolves.toBe(DEFAULT_PYTHON_CODE_EVAL_SOURCE);
  });

  it("keeps Python helpers defined above evaluate on submit", async () => {
    const source = `def helper(value):
  return bool(value)


def evaluate(ctx: EvaluationContext) -> EvaluationResult:
  is_valid = helper(ctx.observation.output)
  return EvaluationResult(scores=[Score(name="ok", value=is_valid)])`;

    await expect(
      formatAndStripCodeEvalSourceForSubmit({
        sourceCode: source,
        sourceCodeLanguage: "PYTHON",
      }),
    ).resolves.toBe(source);
  });

  it("still injects the hidden contract when the source imports dataclass itself", async () => {
    // Regression: the contract-presence check must not mistake a user-owned
    // `from dataclasses import dataclass` for the full hidden contract,
    // otherwise the contract types raise blocking F821 errors.
    const source = `from dataclasses import dataclass


@dataclass
class Helper:
  flag: bool


def evaluate(ctx: EvaluationContext) -> EvaluationResult:
  return EvaluationResult(scores=[Score(name="ok", value=True)])`;

    const result = await validateCodeEvalSourceWithPython(source);

    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
      ),
    ).toEqual([]);
  });
});
