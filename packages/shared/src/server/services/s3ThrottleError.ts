const MAX_CAUSE_DEPTH = 8;

/**
 * S3 throttling (`SlowDown` / "reduce your request rate"). Storage helpers wrap
 * the SDK error in a new `Error` with the original as `cause`, so callers that
 * only see the wrapper still need to recognize it.
 */
export function isS3SlowDownError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!current || typeof current !== "object" || seen.has(current)) {
      return false;
    }
    seen.add(current);
    if (matchesSlowDown(current)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function matchesSlowDown(err: object): boolean {
  if ("name" in err && err.name === "SlowDown") return true;
  if ("Code" in err && err.Code === "SlowDown") return true;
  if ("code" in err && err.code === "SlowDown") return true;
  if ("message" in err && typeof err.message === "string") {
    return (
      err.message.includes("SlowDown") ||
      err.message.includes("reduce your request rate")
    );
  }
  return false;
}
