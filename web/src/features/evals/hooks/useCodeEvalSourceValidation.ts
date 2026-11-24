import { useCallback, useEffect, useState } from "react";
import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";

import { useCanViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";
import {
  type CodeEvalSourceCodeLanguage,
  type CodeEvalValidationResult,
  validateCodeEvalSourceWithLanguage,
} from "@/src/features/evals/utils/code-eval-template-validation";

type UseCodeEvalSourceValidationParams = {
  projectId: string;
  enabled: boolean;
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
};

type ValidateCodeEvalSourceParams = {
  sourceCode?: string;
  sourceCodeLanguage?: CodeEvalSourceCodeLanguage;
};

function getLanguageLabel(sourceCodeLanguage: CodeEvalSourceCodeLanguage) {
  return sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
    ? "Python"
    : "TypeScript";
}

async function getCodeEvalValidationResult({
  sourceCode,
  sourceCodeLanguage,
  traceEvalsAvailable,
}: {
  sourceCode: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
  traceEvalsAvailable: boolean;
}): Promise<CodeEvalValidationResult> {
  try {
    return await validateCodeEvalSourceWithLanguage({
      source: sourceCode,
      sourceCodeLanguage,
      traceEvalsAvailable,
    });
  } catch (error) {
    return {
      sourceBytes: new TextEncoder().encode(sourceCode).length,
      hasErrors: true,
      diagnostics: [
        {
          from: 0,
          to: Math.max(1, sourceCode.length),
          severity: "error",
          message:
            error instanceof Error
              ? error.message
              : `Failed to validate ${getLanguageLabel(sourceCodeLanguage)} source.`,
        },
      ],
    };
  }
}

export function useCodeEvalSourceValidation({
  projectId,
  enabled,
  sourceCode,
  sourceCodeLanguage,
}: UseCodeEvalSourceValidationParams) {
  const traceEvalsAvailable = useCanViewTraceTranscriptsEvals(projectId);
  const [validationResult, setValidationResult] =
    useState<CodeEvalValidationResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  const reset = useCallback(() => {
    setValidationResult(null);
    setIsPending(false);
  }, []);

  const validate = useCallback(
    async (params?: ValidateCodeEvalSourceParams) => {
      const nextSourceCode = params?.sourceCode ?? sourceCode;
      const nextSourceCodeLanguage =
        params?.sourceCodeLanguage ?? sourceCodeLanguage;

      setIsPending(true);
      const result = await getCodeEvalValidationResult({
        sourceCode: nextSourceCode,
        sourceCodeLanguage: nextSourceCodeLanguage,
        traceEvalsAvailable,
      });
      setValidationResult(result);
      setIsPending(false);

      return !result.hasErrors;
    },
    [sourceCode, sourceCodeLanguage, traceEvalsAvailable],
  );

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    let isActive = true;
    setIsPending(true);

    const timeout = setTimeout(() => {
      getCodeEvalValidationResult({
        sourceCode,
        sourceCodeLanguage,
        traceEvalsAvailable,
      })
        .then((result) => {
          if (!isActive) return;
          setValidationResult(result);
        })
        .finally(() => {
          if (isActive) setIsPending(false);
        });
    }, 300);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [enabled, reset, sourceCode, sourceCodeLanguage, traceEvalsAvailable]);

  return {
    isValid: Boolean(validationResult) && !validationResult?.hasErrors,
    isPending,
    validationResult,
    validate,
    reset,
  };
}
