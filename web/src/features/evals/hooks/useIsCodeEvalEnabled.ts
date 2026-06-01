import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";

const EMPTY_SUPPORTED_SOURCE_CODE_LANGUAGES: EvalTemplateSourceCodeLanguage[] =
  [];
const CLOUD_SUPPORTED_SOURCE_CODE_LANGUAGES = [
  EvalTemplateSourceCodeLanguage.TYPESCRIPT,
  EvalTemplateSourceCodeLanguage.PYTHON,
] satisfies EvalTemplateSourceCodeLanguage[];

export function useIsCodeEvalEnabled(): {
  enabled: boolean;
  supportedSourceCodeLanguages: EvalTemplateSourceCodeLanguage[];
  isLoading: boolean;
} {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined) {
    return {
      enabled: true,
      supportedSourceCodeLanguages: CLOUD_SUPPORTED_SOURCE_CODE_LANGUAGES,
      isLoading: false,
    };
  }

  const capabilities = api.evals.codeEvalCapabilities.useQuery(undefined, {
    staleTime: Infinity,
  });
  const supportedSourceCodeLanguages =
    capabilities.data?.supportedSourceCodeLanguages ??
    EMPTY_SUPPORTED_SOURCE_CODE_LANGUAGES;

  return {
    enabled: capabilities.data?.enabled ?? false,
    supportedSourceCodeLanguages,
    isLoading: capabilities.isLoading,
  };
}
