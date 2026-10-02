import { describe, expect, it, vi } from "vitest";

import {
  McpEvaluatorInput,
  toEvaluatorServiceInput,
} from "@/src/features/mcp/server/evals/tools/evaluatorInput";
import {
  assertRuleAssignmentsReplaceableViaMcp,
  toMcpEvaluationRule,
} from "@/src/features/mcp/server/evals/rule-service";

const decisionModelInput = {
  name: "Support classifier",
  type: "DECISION_MODEL" as const,
  questions: [
    {
      id: "topic",
      type: "choice" as const,
      scoreName: "topic",
      instructions: "Classify the support request.",
      options: [
        { value: "billing", description: "Billing questions." },
        { value: "technical", description: "Technical questions." },
      ],
    },
  ],
  modelConfig: {
    provider: "typesafe",
    model: "jev-latest",
  },
  variableMapping: [
    {
      templateVariable: "input",
      selectedColumnId: "input" as const,
    },
  ],
};

describe("MCP evaluator input", () => {
  it("converts a decision-model definition to evaluator service input", () => {
    expect(toEvaluatorServiceInput(decisionModelInput)).toEqual({
      name: decisionModelInput.name,
      description: null,
      definition: {
        type: "DECISION_MODEL",
        questions: decisionModelInput.questions,
        provider: "typesafe",
        model: "jev-latest",
        vars: ["input"],
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
          },
        ],
      },
    });
  });

  it.each([
    ["questions", { questions: undefined }],
    ["modelConfig", { modelConfig: undefined }],
    ["variableMapping", { variableMapping: undefined }],
  ])("requires decision-model %s", (field, override) => {
    const result = McpEvaluatorInput.safeParse({
      ...decisionModelInput,
      ...override,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining([field]),
          }),
        ]),
      );
    }
  });

  it("exposes decision-model assignments in MCP evaluation rules", () => {
    const createdAt = new Date("2026-10-02T00:00:00.000Z");
    const updatedAt = new Date("2026-10-02T01:00:00.000Z");

    expect(
      toMcpEvaluationRule({
        id: "rule-1",
        name: "Support routing",
        enabled: true,
        sampling: 1,
        filter: [],
        assignments: [
          {
            evaluator: {
              id: "evaluator-1",
              name: "Support classifier",
              type: "DECISION_MODEL",
            },
            variableMapping: [
              {
                templateVariable: "input",
                selectedColumnId: "input",
                jsonSelector: null,
              },
            ],
          },
        ],
        createdAt,
        updatedAt,
      } as never),
    ).toEqual({
      id: "rule-1",
      name: "Support routing",
      enabled: true,
      sampling: 1,
      filter: [],
      evaluators: [
        {
          evaluatorId: "evaluator-1",
          evaluatorName: "Support classifier",
          evaluatorType: "decision_model",
          variableMapping: [
            {
              variable: "input",
              source: "input",
            },
          ],
        },
      ],
      createdAt,
      updatedAt,
    });
  });

  it("allows MCP to replace rules with decision-model assignments", async () => {
    await expect(
      assertRuleAssignmentsReplaceableViaMcp(
        {
          get: vi.fn().mockResolvedValue({
            assignments: [
              {
                evaluator: {
                  type: "DECISION_MODEL",
                },
              },
            ],
          }),
        } as never,
        "project-1",
        "rule-1",
      ),
    ).resolves.toBeUndefined();
  });
});
