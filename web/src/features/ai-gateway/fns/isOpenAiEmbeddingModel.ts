/** OpenAI's catalog has no capability field, so its embedding models are recognised by name. */
export function isOpenAiEmbeddingModel(model: string) {
  return model.startsWith("text-embedding-");
}
