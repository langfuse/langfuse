export const LLM_WARNINGS_HEADER = "x-langfuse-llm-warnings";

const MAX_WARNING_COUNT = 5;
const MAX_WARNING_LENGTH = 500;

export function createLlmWarningsHeader(
  warnings: readonly string[],
): Record<string, string> {
  if (warnings.length === 0) return {};

  return {
    [LLM_WARNINGS_HEADER]: encodeURIComponent(
      JSON.stringify(
        warnings
          .slice(0, MAX_WARNING_COUNT)
          .map((warning) => warning.slice(0, MAX_WARNING_LENGTH)),
      ),
    ),
  };
}

export function readLlmWarnings(response: Response): string[] {
  const header = response.headers.get(LLM_WARNINGS_HEADER);
  if (!header) return [];

  try {
    const parsed = JSON.parse(decodeURIComponent(header));
    return Array.isArray(parsed)
      ? parsed.filter(
          (warning): warning is string => typeof warning === "string",
        )
      : [];
  } catch {
    return [];
  }
}
