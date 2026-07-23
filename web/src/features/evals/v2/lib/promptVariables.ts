export function removePromptVariable(prompt: string, variable: string) {
  return prompt.replace(/{{\s*([^{}]*?)\s*}}/g, (match, candidate: string) =>
    candidate.trim() === variable ? "" : match,
  );
}
