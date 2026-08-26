import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { EvaluationRule, Evaluator } from "@/src/features/public-api";

export const codeDefinition = (sourceCode: string) => ({
  type: "code" as const,
  sourceCode,
  sourceCodeLanguage: "TYPESCRIPT" as const,
});

export const createCodeEvaluator = (name: string, auth: string) =>
  makeZodVerifiedAPICall(
    Evaluator,
    "POST",
    "/api/public/v2/evaluators",
    {
      name,
      description: `${name} description`,
      ...codeDefinition("function evaluate() { return { scores: [] }; }"),
    },
    auth,
    201,
  );

export const createEvaluationRule = (params: {
  name: string;
  evaluatorId: string;
  auth: string;
}) =>
  makeZodVerifiedAPICall(
    EvaluationRule,
    "POST",
    "/api/public/v2/evaluation-rules",
    {
      name: params.name,
      enabled: false,
      filter: [],
      evaluatorAssignments: [
        { evaluatorId: params.evaluatorId, variableMapping: null },
      ],
    },
    params.auth,
    201,
  );
