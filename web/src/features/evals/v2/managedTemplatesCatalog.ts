import {
  type EvalTemplateSourceCodeLanguage,
  type EvalTemplateType,
} from "@langfuse/shared";

import { type ScoreOutputDataType } from "@/src/features/evals/v2/scoreOutputTypes";

/** Maintainer of the templates Langfuse itself ships. */
export const LANGFUSE_MAINTAINER = "langfuse";

/**
 * A template Langfuse or a partner maintains. These ship with the app and are
 * never stored per project, so they carry no id, version, or author — the
 * catalog entry is the definition.
 */
export type ManagedTemplate = {
  name: string;
  category: string;
  icon: string;
  description: string;
  maintainer: string;
  evaluator:
    | {
        type: Extract<EvalTemplateType, "LLM_AS_JUDGE">;
        prompt: string;
        variables: Array<{
          name: string;
          defaultMapping: {
            field: string;
          };
        }>;
        outputDefinition: {
          dataType: ScoreOutputDataType;
          score: {
            description: string;
            minValue: number;
            maxValue: number;
          };
          reasoning: {
            description: string;
          };
        };
      }
    | {
        type: Extract<EvalTemplateType, "CODE">;
        language: EvalTemplateSourceCodeLanguage;
        source: string;
      };
};

type Catalog = {
  schemaVersion: 1;
  categories: Array<{
    key: string;
    label: string;
    description: string;
    icon: string;
  }>;
  templates: ManagedTemplate[];
};

export const MANAGED_TEMPLATES_CATALOG = {
  schemaVersion: 1,
  categories: [
    {
      key: "quality",
      label: "Quality",
      description: "Core output quality checks for any LLM generation.",
      icon: "gauge",
    },
  ],
  templates: [
    {
      name: "Hallucination",
      category: "quality",
      icon: "alert-triangle",
      description:
        "Detects claims not grounded in facts or verifiable knowledge.",
      maintainer: "langfuse",
      evaluator: {
        type: "LLM_AS_JUDGE",
        prompt: `Evaluate the degree of hallucination in the response.

Query:
{{query}}

Response:
{{generation}}`,
        variables: [
          {
            name: "query",
            defaultMapping: {
              field: "input",
            },
          },
          {
            name: "generation",
            defaultMapping: {
              field: "output",
            },
          },
        ],
        outputDefinition: {
          dataType: "NUMERIC",
          score: {
            description: "Degree of hallucination.",
            minValue: 0,
            maxValue: 1,
          },
          reasoning: {
            description: "One sentence explaining the score.",
          },
        },
      },
    },
    {
      name: "Exact Match",
      category: "quality",
      icon: "equal",
      description:
        "Checks whether the observation output exactly matches its input.",
      maintainer: "langfuse",
      evaluator: {
        type: "CODE",
        language: "TYPESCRIPT",
        source: `function evaluate(ctx: EvaluationContext): EvaluationResult {
  const matches =
    ctx.observation.input !== undefined &&
    ctx.observation.output === ctx.observation.input;

  return {
    scores: [
      {
        name: "Exact match",
        value: matches,
        dataType: "BOOLEAN",
      },
    ],
  };
}`,
      },
    },
  ],
} as const satisfies Catalog;
