// PostHog drops events over 1MB, and its capture endpoint answers 413 when
// Kafka refuses one. Capture re-encodes the event as an escaped JSON string
// and ingestion adds its own properties, so the budget stays well below that.
const POSTHOG_MAX_EVENT_PROPERTIES_BYTES = 256 * 1024;

const POSTHOG_TRUNCATED_PROPERTIES_KEY = "langfuse_truncated_properties";

// A truncated property keeps at least this much as a preview.
const MIN_TRUNCATED_PROPERTY_BYTES = 1024;

const serializedBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value) ?? "");

/**
 * Shrinks an event whose serialized properties exceed `maxBytes`, so one
 * oversized score or observation cannot fail the whole export. The largest
 * properties are cut first, to string prefixes, and the event lists their
 * names under `langfuse_truncated_properties`. `$`-prefixed PostHog control
 * properties are never cut. Events within the budget are returned unchanged.
 */
export function fitPostHogEventSize<
  T extends { properties?: Record<string, unknown> },
>(
  event: T,
  maxBytes: number = POSTHOG_MAX_EVENT_PROPERTIES_BYTES,
): { event: T; truncatedProperties: string[] } {
  const unchanged = { event, truncatedProperties: [] };
  if (!event.properties) return unchanged;

  let total: number;
  try {
    total = serializedBytes(event.properties);
  } catch {
    // Not serializable here (e.g. a BigInt); leave it to the SDK as before.
    return unchanged;
  }
  if (total <= maxBytes) return unchanged;

  const candidates = Object.entries(event.properties)
    .filter(([key]) => !key.startsWith("$"))
    .map(([key, value]) => ({ key, value, bytes: serializedBytes(value) }))
    .sort((a, b) => b.bytes - a.bytes);

  // Leave room for the marker listing every key that could be cut.
  const target =
    maxBytes -
    Buffer.byteLength(
      `,${JSON.stringify(POSTHOG_TRUNCATED_PROPERTIES_KEY)}:${JSON.stringify(
        candidates.map(({ key }) => key),
      )}`,
    );

  const properties = { ...event.properties };
  const truncatedProperties: string[] = [];
  for (const { key, value, bytes } of candidates) {
    if (total <= target) break;
    const allowance = Math.max(
      MIN_TRUNCATED_PROPERTY_BYTES,
      bytes - (total - target),
    );
    if (allowance >= bytes) continue;

    const truncated = truncateToSerializedBytes(
      typeof value === "string" ? value : JSON.stringify(value),
      allowance,
    );
    properties[key] = truncated;
    truncatedProperties.push(key);
    // Swapping one value changes the object's JSON by exactly the difference.
    total += serializedBytes(truncated) - bytes;
  }

  properties[POSTHOG_TRUNCATED_PROPERTIES_KEY] = truncatedProperties;
  return { event: { ...event, properties }, truncatedProperties };
}

// JSON escaping can make a string's encoding longer than its length, so shrink
// the prefix until its serialized form fits.
function truncateToSerializedBytes(text: string, maxBytes: number): string {
  let length = Math.min(text.length, maxBytes - 2);
  let prefix = text.slice(0, length);
  let bytes = serializedBytes(prefix);
  while (length > 0 && bytes > maxBytes) {
    length = Math.min(length - 1, Math.floor((length * maxBytes) / bytes));
    prefix = text.slice(0, length);
    bytes = serializedBytes(prefix);
  }
  // A cut between a surrogate pair leaves a lone high surrogate, which strict
  // JSON parsers reject.
  return /[\uD800-\uDBFF]$/.test(prefix) ? prefix.slice(0, -1) : prefix;
}
