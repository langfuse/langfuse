import * as opentelemetry from "@opentelemetry/api";
import type { IncomingHttpHeaders } from "http";
import { env } from "../env";

/**
 * Returns the list of header names (lower-case) that should be propagated.
 * Comma-separated list can be supplied via LANGFUSE_PROPAGATED_HEADERS env var.
 * Defaults to x-request-id if unset.
 */
export const getPropagatedHeaderNames = (): string[] => {
  const raw = (env.LANGFUSE_PROPAGATED_HEADERS ?? "x-request-id").toLowerCase();
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
};

/**
 * Creates/extends the current active OTel context with a baggage object
 * containing the configured headers that are present on the request.
 * The returned context MUST be activated via opentelemetry.context.with(ctx, fn)
 * for downstream code to see the baggage.
 */
export const contextWithHeaders = (
  headers: IncomingHttpHeaders,
): opentelemetry.Context => {
  const headerNames = getPropagatedHeaderNames();

  let baggage =
    opentelemetry.propagation.getBaggage(
      opentelemetry.context.active(),
    ) ?? opentelemetry.propagation.createBaggage();

  headerNames.forEach((name) => {
    const value = headers[name];
    if (!value) return;
    // If multiple values, take the first one.
    const strValue = Array.isArray(value) ? value[0] : value;
    baggage = baggage.setEntry(name, { value: strValue });
  });

  return opentelemetry.propagation.setBaggage(
    opentelemetry.context.active(),
    baggage,
  );
};
