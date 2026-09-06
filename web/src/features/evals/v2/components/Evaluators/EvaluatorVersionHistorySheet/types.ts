import type {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  EvaluatorPromptMessage,
  ModelConfig,
} from "@langfuse/shared";

export type EvaluatorVersion = {
  id: string;
  version: number;
  createdAt: Date;
  type: EvalTemplateType;
  sourceCode: string | null;
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage | null;
  promptMessages: EvaluatorPromptMessage[] | null;
  provider: string | null;
  model: string | null;
  modelParams: ModelConfig | null;
  vars: string[];
  variableMapping: unknown;
  outputDefinition: unknown;
  createdByUser: { name: string | null; email: string | null } | null;
};
