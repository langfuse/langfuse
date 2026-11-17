import { env } from "@/src/env.mjs";

// Next.js bounds request bodies per route before any schema or service runs,
// so a configured skill limit must account for the JSON representation too.
// JSON can escape one-byte control characters as six-byte \\u00XX sequences.
// Keep the 4.5mb floor for small configured limits and reserve 1 MiB for the
// request envelope and file metadata.
export function getSkillRequestBodySizeLimit(): string {
  const floorBytes = 4.5 * 1024 * 1024;
  const maxJsonEscapeBytesPerInputByte = 6;
  const requestEnvelopeHeadroomBytes = 1024 * 1024;
  const limitBytes = Math.max(
    floorBytes,
    env.LANGFUSE_SKILL_MAX_BYTES * maxJsonEscapeBytesPerInputByte +
      requestEnvelopeHeadroomBytes,
  );
  return limitBytes === floorBytes ? "4.5mb" : `${limitBytes}b`;
}
