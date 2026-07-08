import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";
import { env } from "@langfuse/shared/src/env";

export type CodeEvalCapabilities = {
  enabled: boolean;
  supportedSourceCodeLanguages: EvalTemplateSourceCodeLanguage[];
};

const ALL_CODE_EVAL_SOURCE_LANGUAGES = [
  EvalTemplateSourceCodeLanguage.TYPESCRIPT,
  EvalTemplateSourceCodeLanguage.PYTHON,
] satisfies EvalTemplateSourceCodeLanguage[];

export function getCodeEvalCapabilities(): CodeEvalCapabilities {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return {
      enabled: true,
      supportedSourceCodeLanguages: ALL_CODE_EVAL_SOURCE_LANGUAGES,
    };
  }

  switch (env.LANGFUSE_CODE_EVAL_DISPATCHER) {
    case "aws-lambda":
      return {
        enabled: true,
        supportedSourceCodeLanguages: ALL_CODE_EVAL_SOURCE_LANGUAGES,
      };
    case "insecure-local":
      return {
        enabled: true,
        supportedSourceCodeLanguages: [
          EvalTemplateSourceCodeLanguage.TYPESCRIPT,
        ],
      };
    default:
      return {
        enabled: false,
        supportedSourceCodeLanguages: [],
      };
  }
}

export function isCodeEvalEnabled(): boolean {
  return getCodeEvalCapabilities().enabled;
}

export function isCodeEvalSourceCodeLanguageSupported(
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage | null | undefined,
): boolean {
  if (!sourceCodeLanguage) return false;

  return getCodeEvalCapabilities().supportedSourceCodeLanguages.includes(
    sourceCodeLanguage,
  );
}
