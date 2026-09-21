export function idSearchConfidence(value: string): "high" | "low" | null {
  // Complete trace/span IDs and UUIDs are strong signals. Custom identifiers
  // are only suggestions: a prefix or mixed string can also be ordinary text.
  if (
    /^(?:[0-9a-f]{16}|[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
      value,
    )
  )
    return "high";
  if (
    /^(?:trace|span|obs|observation|session|user)[_-][a-z0-9][a-z0-9_-]*$/i.test(
      value,
    ) ||
    (/^[a-z0-9][a-z0-9_-]{15,}$/i.test(value) &&
      /[a-z]/i.test(value) &&
      /[0-9]/.test(value))
  )
    return "low";
  return null;
}
