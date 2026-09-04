const MIB = 1024 * 1024;

function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function httpUrl(name, fallback) {
  const value = process.env[name] || fallback;
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  return url;
}

function enumValue(name, fallback, values) {
  const value = process.env[name] || fallback;
  if (!values.includes(value)) {
    throw new Error(`${name} must be one of: ${values.join(", ")}`);
  }
  return value;
}

export const config = Object.freeze({
  port: positiveInteger("PORT", 3100),
  upstreamUrl: httpUrl("UPSTREAM_ORIGIN", "http://mock-upstream:4000"),
  otelUrl: httpUrl("OTEL_URL", "http://mock-otel:4318/v1/traces"),
  bodyLimitBytes: positiveInteger("BODY_LIMIT_BYTES", 32 * MIB),
  captureLimitBytes: positiveInteger("CAPTURE_LIMIT_BYTES", 256 * 1024),
  telemetryQueueCapacity: positiveInteger("TELEMETRY_QUEUE_CAPACITY", 1024),
  telemetryMode: enumValue("TELEMETRY_MODE", "inline", ["inline", "ipc"]),
  telemetryBatchMaxSpans: positiveInteger("TELEMETRY_BATCH_MAX_SPANS", 50),
  telemetryBatchMaxWaitMs: positiveInteger("TELEMETRY_BATCH_MAX_WAIT_MS", 250),
});
