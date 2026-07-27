// Masking for arbitrary third-party credentials: reveal only the last 4
// characters. getDisplaySecretKey (shared apiKeys.ts) also reveals the first
// 6, which is safe only for Langfuse keys with a public prefix (LFE-14384).
export const getDisplayCredential = (secret: string): string =>
  "..." + secret.slice(-4);
