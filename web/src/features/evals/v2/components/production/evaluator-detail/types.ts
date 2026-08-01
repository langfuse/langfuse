export type EvaluatorVersion = {
  id: string;
  version: number;
  createdAt: Date;
  type: "LLM_AS_JUDGE" | "CODE";
  sourceCode: string | null;
  sourceCodeLanguage: "PYTHON" | "TYPESCRIPT" | null;
  prompt: string | null;
  provider: string | null;
  model: string | null;
  outputDefinition: unknown;
};
