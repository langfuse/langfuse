import { type CaptureResult, type PostHog } from "posthog-js";

/** Retain route shape without exporting observed agent identities or filters. */
export function sanitizeAgentsTelemetryUrl(value: string): string {
  if (!value.includes("/agents") && !value.includes("/api/trpc/")) return value;
  let url: URL;
  try {
    url = new URL(value, "https://telemetry.invalid");
  } catch {
    return value;
  }
  const agentPath = /\/project\/[^/]+\/agents(?:\/.*)?$/.exec(url.pathname);
  if (agentPath) {
    const isDetail =
      agentPath[0].split("/").length > 4 || url.searchParams.has("agentId");
    url.pathname =
      url.pathname.slice(0, agentPath.index) +
      "/project/[projectId]/agents" +
      (isDetail ? "/[agentId]" : "");
  } else {
    const procedures = url.pathname.split("/api/trpc/")[1];
    if (!procedures?.split(",").some((name) => name.startsWith("agents.")))
      return value;
  }
  url.search = "";
  url.hash = "";
  return value.startsWith("/") ? url.pathname : `${url.origin}${url.pathname}`;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeAgentsTelemetryUrl(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, sanitizeValue(child)]),
    );
  return value;
}

/** Flags also read these attribution records without passing through before_send. */
export function sanitizeAgentsTelemetryPersistence(
  client: Pick<PostHog, "get_property" | "register">,
): void {
  // PostHog 1.417 stores initial attribution as {u, r}, and session attribution
  // under props. Preserve the SDK records while redacting only Agents URLs.
  for (const key of [
    "$initial_person_info",
    "$initial_referrer_info",
    "$initial_campaign_params",
    "$client_session_props",
    "$stored_person_properties",
  ]) {
    const value: unknown = client.get_property(key);
    if (value === undefined) continue;
    const sanitized = sanitizeValue(value);
    if (JSON.stringify(sanitized) !== JSON.stringify(value))
      client.register({ [key]: sanitized });
  }
}

/** Includes initial/session attribution and persisted referrers on later pages. */
export function sanitizeAgentsTelemetryEvent(
  event: CaptureResult | null,
): CaptureResult | null {
  // Replay data can be compressed here. The recorder passes page metadata,
  // SPA pageview URLs and network URLs through maskCapturedNetworkRequestFn
  // before compression.
  if (!event || event.event === "$snapshot") return event;
  const properties = sanitizeValue(
    event.properties,
  ) as CaptureResult["properties"];
  if (properties.$current_url !== event.properties.$current_url)
    properties.title = "Agents | Langfuse";
  return {
    ...event,
    properties,
    ...(event.$set && {
      $set: sanitizeValue(event.$set) as CaptureResult["$set"],
    }),
    ...(event.$set_once && {
      $set_once: sanitizeValue(event.$set_once) as CaptureResult["$set_once"],
    }),
  };
}
