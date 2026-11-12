/** Whose gateway keys and usage a caller may see; always derived from the session. */
export type GatewayUsageScope =
  | { scope: "organization" }
  | { scope: "ownUsage"; userId: string };

/** The key owner to filter by, or `undefined` for every owner in the organization. */
export function getKeyOwnerFilter(usage: GatewayUsageScope) {
  return usage.scope === "ownUsage" ? usage.userId : undefined;
}
