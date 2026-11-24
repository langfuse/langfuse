import { xxh32 } from "@node-rs/xxhash";

export type OtelShadowRowLocator = {
  traceId: string;
  spanId: string;
  startTime: string;
};

// Both writers use UTC. Their returned locators differ in separator and precision.
export function shadowStoredTime(value: string) {
  const start =
    /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z?$/.exec(value);
  return start
    ? `${start[1]} ${start[2]}.${(start[3] ?? "").padEnd(6, "0").slice(0, 6)}`
    : undefined;
}

// Historical span IDs can contain arbitrary text. Only log an OTLP-shaped ID
// alongside the ClickHouse lookup key.
export function shadowRowKey(projectId: string, row: OtelShadowRowLocator) {
  const startTime = shadowStoredTime(row.startTime);
  return {
    projectId,
    traceHash: xxh32(row.traceId),
    ...(startTime && { startTime }),
    ...(/^[a-f\d]{16}$/i.test(row.spanId) && { spanId: row.spanId }),
  };
}

// Both the OTLP publisher and the admin replay endpoint mint this UUID on the
// server. Older jobs with another identifier format can still be compared.
export function shadowJobId(id: string) {
  return /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(
    id,
  )
    ? id
    : undefined;
}
