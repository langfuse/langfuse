import { env } from "@/src/env.mjs";

// Next.js bounds request bodies per route before any schema or service runs,
// so a configured skill limit the body parser knows nothing about rejects
// valid requests before they reach it. The parser bound tracks the
// configured skill limit plus headroom for JSON encoding (string escaping
// and the request envelope), keeping 4.5mb as a floor so default
// deployments are unchanged.
export function getSkillRequestBodySizeLimit(): string {
  const floorBytes = 4.5 * 1024 * 1024;
  const limitBytes = Math.max(
    floorBytes,
    env.LANGFUSE_SKILL_MAX_BYTES * 2 + 1024 * 1024,
  );
  return limitBytes === floorBytes ? "4.5mb" : `${limitBytes}b`;
}
