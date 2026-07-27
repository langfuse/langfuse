/**
 * Result of translating persisted Langfuse `modelParams.providerOptions` into
 * AI SDK provider options. Silent dropping is unacceptable: the compatibility
 * boundary turns a failed translation into an explicit non-retryable
 * configuration error.
 */
export type TranslatedProviderOptions =
  | { ok: true; value: Record<string, unknown> | undefined }
  | { ok: false; unknownKeys: string[] };

export type LLMCredentialSource = "user" | "langfuse";
