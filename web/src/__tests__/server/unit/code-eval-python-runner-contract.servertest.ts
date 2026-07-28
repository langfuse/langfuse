import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { PYTHON_CODE_EVAL_CONTRACT } from "@/src/features/evals/utils/code-eval-template-starter-examples";

const runnerPath = path.join(
  __dirname,
  "../../../../..",
  "scripts/code-eval-runners/python/code_based_eval_handler.py",
);

// The Python Lambda runner reconstructs the payload into dataclasses (unlike
// the Node runner, which passes it through verbatim), so the contract shown
// in the editor can silently drift from what deployed evaluator code sees.
// Pin every dataclass field block of the displayed contract to the runner
// source: the runner may extend a block (from_payload helpers, defaults), but
// each block's field section must appear verbatim.
describe("python code eval runner contract", () => {
  it("contains every dataclass block of the displayed contract verbatim", () => {
    const runnerSource = readFileSync(runnerPath, "utf8");

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

  it("falls back to known aliases in plain score dictionaries", () => {
    const python = `
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("code_eval_runner", sys.argv[1])
runner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = runner
spec.loader.exec_module(runner)

result = runner.handler({
    "code": {
        "source": """
def evaluate(ctx):
    return {
        "scores": [{
            "name": "example",
            "value": True,
            "data_type": "BOOLEAN",
            "config_id": "snake-case-config",
            "metadata": {"snake_case_key": "preserved"},
        }, {
            "name": "canonical-wins",
            "value": True,
            "data_type": "NUMERIC",
            "dataType": "BOOLEAN",
            "config_id": "snake-case-config",
            "configId": "canonical-config",
        }]
    }
"""
    },
    "payload": {"observation": {}},
}, None)
print(json.dumps(result))
`;
    const execution = spawnSync("python3", ["-c", python, runnerPath], {
      encoding: "utf8",
    });

    expect(execution.stderr).toBe("");
    expect(execution.status).toBe(0);
    expect(JSON.parse(execution.stdout)).toEqual({
      scores: [
        {
          name: "example",
          value: true,
          dataType: "BOOLEAN",
          configId: "snake-case-config",
          metadata: { snake_case_key: "preserved" },
        },
        {
          name: "canonical-wins",
          value: true,
          dataType: "BOOLEAN",
          configId: "canonical-config",
        },
      ],
    });
  });
});
