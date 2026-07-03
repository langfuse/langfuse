import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "@astral-sh/ruff-wasm-web";
import {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  formatAndStripCodeEvalSourceForSubmit,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";

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
});
