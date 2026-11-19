/** Gemini's OpenAI-compatible model list has no capability field, so embedding models are recognised by name. */
export function isGeminiEmbeddingModel(model: string) {
  return model.includes("embedding");
}
