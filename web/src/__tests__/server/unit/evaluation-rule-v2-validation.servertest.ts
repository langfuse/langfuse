import {
  EvalTargetObject,
  validateEvaluatorFiltersForTarget,
} from "@langfuse/shared";
import { describe, expect, it } from "vitest";
import {
  CreateRuleSchema,
  RuleSelectionSchema,
} from "@/src/features/evals/v2/server/rules/ruleTypes";
import {
  CreateEvaluationRuleBody,
  UpdateEvaluationRuleBody,
} from "@/src/features/public-api/types/evaluation/evaluationRules";

describe.each([
  [
    "create",
    CreateEvaluationRuleBody,
    { name: "Rule", enabled: false, evaluatorAssignments: [] },
  ],
  ["update", UpdateEvaluationRuleBody, {}],
])("public evaluation rule %s validation", (_boundary, schema, body) => {
  it.each(["status", "level"])(
    "accepts %s filters before canonical validation",
    (column) => {
      const filter = [
        { type: "stringOptions", column, operator: "any of", value: ["ERROR"] },
      ];
      const parsed = schema.parse({ ...body, filter });

      expect(parsed.filter).toEqual(filter);
      const result = validateEvaluatorFiltersForTarget({
        targetObject: EvalTargetObject.EVENT,
        filter: parsed.filter,
      });
      expect(result.isValid).toBe(true);
      expect(result.validatedFilters).toEqual([
        { ...filter[0], column: "level" },
      ]);
    },
  );
});

describe("evaluation rule v2 input validation", () => {
  it("accepts rule names longer than 200 characters", () => {
    expect(
      CreateRuleSchema.safeParse({
        projectId: "project-id",
        name: "r".repeat(201),
        filter: [],
        sampling: 1,
        enabled: true,
        evaluatorAssignments: [],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate rule IDs in explicit bulk selections", () => {
    expect(
      RuleSelectionSchema.safeParse({
        projectId: "project-id",
        ruleIds: ["rule-id", "rule-id"],
      }).success,
    ).toBe(false);
  });

  it("accepts no assignments and rejects malformed variable mappings", () => {
    const input = {
      projectId: "project-id",
      name: "Rule",
      filter: [],
      sampling: 1,
      enabled: true,
    } as const;

    expect(
      CreateRuleSchema.safeParse({ ...input, evaluatorAssignments: [] })
        .success,
    ).toBe(true);
    expect(
      CreateRuleSchema.safeParse({
        ...input,
        evaluatorAssignments: [
          {
            evaluatorId: "evaluator-id",
            variableMapping: [{ arbitrary: true }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("defaults to observation rules and only accepts new rule targets", () => {
    const input = {
      projectId: "project-id",
      name: "Rule",
      filter: [],
      sampling: 1,
      enabled: true,
      evaluatorAssignments: [],
    };

    expect(CreateRuleSchema.parse(input).targetObject).toBe(
      EvalTargetObject.EVENT,
    );
    expect(
      CreateRuleSchema.safeParse({
        ...input,
        targetObject: EvalTargetObject.EXPERIMENT,
      }).success,
    ).toBe(true);
    expect(
      CreateRuleSchema.safeParse({
        ...input,
        targetObject: EvalTargetObject.TRACE,
      }).success,
    ).toBe(false);
    expect(
      CreateRuleSchema.safeParse({
        ...input,
        targetObject: EvalTargetObject.DATASET,
      }).success,
    ).toBe(false);
  });
});
