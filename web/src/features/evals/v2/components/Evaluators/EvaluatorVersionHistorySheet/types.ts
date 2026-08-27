import type {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  EvaluatorPromptMessage,
} from "@langfuse/shared";

export type EvaluatorVersion = {
  id: string;
  version: number;
  createdAt: Date;
  type: EvalTemplateType;
  sourceCode: string | null;
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage | null;
  prompt: string | null;
  promptMessages?: EvaluatorPromptMessage[] | null;
  provider: string | null;
  model: string | null;
  outputDefinition: unknown;
  createdByUser: { name: string | null; email: string | null } | null;
};
