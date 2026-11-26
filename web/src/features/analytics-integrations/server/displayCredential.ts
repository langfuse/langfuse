// Masking for arbitrary third-party credentials: reveal only the last 4
// characters (LFE-14384), as redactApiKey (shared apiKeys.ts) does for any
// value without the Langfuse secret key prefix.
export const getDisplayCredential = (secret: string): string =>
  "..." + secret.slice(-4);
