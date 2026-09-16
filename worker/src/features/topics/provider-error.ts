export class TopicsProviderUnavailable extends Error {}

/** Provider bodies and exception messages can echo credentials or trace content. */
export function topicProviderError(error: unknown): TopicsProviderUnavailable {
  let current = error;
  let status: number | undefined;
  for (
    let depth = 0;
    depth < 4 && current && typeof current === "object";
    depth++
  ) {
    const record = current as Record<string, unknown>;
    const candidate = record.statusCode ?? record.status;
    if (typeof candidate === "number" && candidate >= 400 && candidate <= 599) {
      status = candidate;
      break;
    }
    current = record.cause;
  }
  return new TopicsProviderUnavailable(
    `Topics provider call failed${status ? ` (HTTP ${status})` : ""}. Processing stopped. Check worker credentials or provider availability, then start a new execution. The failed call's conservative budget reservation remains counted.`,
  );
}
