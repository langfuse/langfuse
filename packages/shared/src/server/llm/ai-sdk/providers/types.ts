/**
 * Result of translating Langfuse `modelParams.providerOptions` (whose shape is
 * owned by the LangChain engine's per-adapter passthrough semantics) into AI
 * SDK provider options. Silent dropping is unacceptable: any key an adapter
 * cannot translate makes the dispatcher decline to LangChain (with a recorded
 * reason) instead.
 */
export type TranslatedProviderOptions =
  | { ok: true; value: Record<string, unknown> | undefined }
  | { ok: false; unknownKeys: string[] };
