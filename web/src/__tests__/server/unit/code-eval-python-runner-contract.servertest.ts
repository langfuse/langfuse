import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  PYTHON_CODE_EVAL_CONTRACT,
  TRACE_PYTHON_CODE_EVAL_CONTRACT,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";

// The Python Lambda runner reconstructs the payload into dataclasses (unlike
// the Node runner, which passes it through verbatim), so the contract shown
// in the editor can silently drift from what deployed evaluator code sees.
// Pin every dataclass field block of the displayed contract to the runner
// source: the runner may extend a block (from_payload helpers, defaults), but
// each block's field section must appear verbatim.
function readRunnerSource() {
  return readFileSync(
    path.join(
      __dirname,
      "../../../../..",
      "scripts/code-eval-runners/python/code_based_eval_handler.py",
    ),
    "utf8",
  );
}

function dataclassBlocksOf(contract: string) {
  return contract
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("@dataclass"));
}

describe("python code eval runner contract", () => {
  it("contains every dataclass block of the displayed trace contract verbatim", () => {
    const runnerSource = readRunnerSource();
    const dataclassBlocks = dataclassBlocksOf(TRACE_PYTHON_CODE_EVAL_CONTRACT);

    // ToolCall, ObservationContext, ExperimentContext, TraceContext,
    // EvaluationContext, Score, EvaluationResult
    expect(dataclassBlocks).toHaveLength(7);
    for (const block of dataclassBlocks) {
      expect(runnerSource).toContain(block);
    }
  });

  it("matches the runner for every dataclass block of the displayed observation contract", () => {
    const runnerSource = readRunnerSource();
    const dataclassBlocks = dataclassBlocksOf(PYTHON_CODE_EVAL_CONTRACT);

    // ToolCall, ObservationContext, ExperimentContext, EvaluationContext,
    // Score, EvaluationResult
    expect(dataclassBlocks).toHaveLength(6);
    for (const block of dataclassBlocks) {
      // The runner makes `observation` optional so trace runs can leave it
      // empty. Observation evaluators are still shown it as required.
      const runnerBlock = block.replace(
        "    observation: ObservationContext\n",
        "    observation: ObservationContext | None = None\n",
      );
      expect(runnerSource).toContain(runnerBlock);
    }
  });
});
