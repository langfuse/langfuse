import {
  EvalTemplateSourceCodeLanguageEnum,
  type EvalTemplateSourceCodeLanguage,
} from "@langfuse/shared";

// The preview teaches shape, not full content: long strings and arrays are
// clipped so a huge sample cannot bury the structure.
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_ITEMS = 20;
const IDENTIFIER_REGEX = /^[A-Za-z_$][\w$]*$/;

function truncate(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value;
}

/** Writes a sample value as a TypeScript or Python literal for the ctx preview. */
export function serializeCodeEvalSnippetValue(
  value: unknown,
  language: EvalTemplateSourceCodeLanguage,
  indent: string,
): string {
  if (value === null || value === undefined) {
    return language === EvalTemplateSourceCodeLanguageEnum.PYTHON
      ? "None"
      : String(value);
  }
  if (typeof value === "string") return JSON.stringify(truncate(value));
  if (typeof value === "boolean") {
    if (language === EvalTemplateSourceCodeLanguageEnum.PYTHON) {
      if (value) {
        return "True";
      }
      return "False";
    }
    return String(value);
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const childIndent = `${indent}  `;
    const lines = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(
        (item) =>
          `${childIndent}${serializeCodeEvalSnippetValue(item, language, childIndent)},`,
      );
    if (value.length > MAX_ARRAY_ITEMS) {
      const comment =
        language === EvalTemplateSourceCodeLanguageEnum.PYTHON ? "#" : "//";
      lines.push(
        `${childIndent}${comment} … ${value.length - MAX_ARRAY_ITEMS} more items`,
      );
    }
    return `[\n${lines.join("\n")}\n${indent}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const childIndent = `${indent}  `;
    const lines = entries.map(([key, entry]) => {
      const keyLiteral =
        language === EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT &&
        IDENTIFIER_REGEX.test(key)
          ? key
          : JSON.stringify(key);
      return `${childIndent}${keyLiteral}: ${serializeCodeEvalSnippetValue(entry, language, childIndent)},`;
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  return JSON.stringify(String(value));
}
