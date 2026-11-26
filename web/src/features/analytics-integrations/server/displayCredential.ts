// Masking for arbitrary third-party credentials: reveal only the last 4
// characters. redactApiKey (shared apiKeys.ts) keeps the sk-lf- prefix,
// which is safe only for Langfuse keys (LFE-14384).
export const getDisplayCredential = (secret: string): string =>
  "..." + secret.slice(-4);
