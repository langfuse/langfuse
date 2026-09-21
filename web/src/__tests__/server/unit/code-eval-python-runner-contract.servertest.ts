import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { PYTHON_CODE_EVAL_CONTRACT } from "@/src/features/evals/utils/code-eval-template-starter-examples";

// The Python Lambda runner reconstructs the payload into dataclasses (unlike
// the Node runner, which passes it through verbatim), so the contract shown
// in the editor can silently drift from what deployed evaluator code sees.
// Pin every dataclass field block of the displayed contract to the runner
// source: the runner may extend a block (from_payload helpers, defaults), but
// each block's field section must appear verbatim.
describe("python code eval runner contract", () => {
  it("contains every dataclass block of the displayed contract verbatim", () => {
    const runnerSource = readFileSync(
      path.join(
        __dirname,
        "../../../../..",
        "scripts/code-eval-runners/python/code_based_eval_handler.py",
      ),
      "utf8",
    );

    const dataclassBlocks = PYTHON_CODE_EVAL_CONTRACT.split(/\n\n+/)
      .map((block) => block.trim())
      .filter((block) => block.startsWith("@dataclass"));

    // ToolCall, ObservationContext, ExperimentContext, EvaluationContext,
    // Score, EvaluationResult
    expect(dataclassBlocks).toHaveLength(6);
    for (const block of dataclassBlocks) {
      expect(runnerSource).toContain(block);
    }
  });
});
