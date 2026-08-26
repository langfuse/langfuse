import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

const SOURCE_CODE_LANGUAGE_LABELS = {
  [EvalTemplateSourceCodeLanguageEnum.PYTHON]: "Python",
  [EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT]: "TypeScript",
} satisfies Record<EvalTemplateSourceCodeLanguage, string>;

/** Product wording for a code evaluator's language, with a neutral fallback. */
export function sourceCodeLanguageLabel(
  language: EvalTemplateSourceCodeLanguage | null | undefined,
  fallback = "Code",
) {
  return language ? SOURCE_CODE_LANGUAGE_LABELS[language] : fallback;
}
