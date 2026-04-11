export function normalizeSpielwiesePromptPreviewText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getSpielwiesePromptPreviewText(value: string) {
  return normalizeSpielwiesePromptPreviewText(value);
}
