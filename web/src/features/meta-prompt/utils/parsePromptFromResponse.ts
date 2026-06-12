export type ParsedPromptResponse = {
  improvedPrompt: string | null;
  clarifyingQuestions: string | null;
  assumptions: string | null;
  fillInChecklist: string | null;
};

export function parsePromptFromResponse(
  response: string,
): ParsedPromptResponse {
  return {
    improvedPrompt: extractSection(response, "## Improved Prompt"),
    clarifyingQuestions: extractSection(response, "## Clarifying Questions"),
    assumptions: extractSection(response, "## Assumptions"),
    fillInChecklist: extractSection(response, "## User Fill-in Checklist"),
  };
}

function extractSection(text: string, header: string): string | null {
  const headerIndex = text.indexOf(header);
  if (headerIndex === -1) return null;

  const contentStart = headerIndex + header.length;
  const nextHeaderMatch = text.slice(contentStart).match(/\n## /);
  const contentEnd = nextHeaderMatch
    ? contentStart + (nextHeaderMatch.index ?? text.length)
    : text.length;

  return text.slice(contentStart, contentEnd).trim();
}
