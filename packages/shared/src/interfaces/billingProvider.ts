import { type CloudConfigSchema } from "./cloudConfigSchema";

export type BillingProvider = "stripe" | "clickhouse";

type OrgWithCloudConfig = {
  cloudConfig: CloudConfigSchema | null | undefined;
};

/**
 * Resolve which billing provider owns an organization.
 *
 * Decision order:
 * 1. Explicit CHB state always wins — the org is already on CHB. Sticky from
 *    the first checkout (which persists `clickhouse.organizationId`), so
 *    later cutoff changes cannot strand an org mid-flow.
 * 2. Any existing Stripe billing state pins the org to Stripe (legacy). An
 *    existing billed customer can never flip providers via config.
 * 3. Otherwise the org has never been billed: the cutoff decides at upgrade
 *    time — first checkouts on/after the cutoff instant go to CHB, regardless
 *    of when the org was created. Until a checkout writes CHB state,
 *    resolving to "clickhouse" has no side effects.
 *
 * The cutoff is injected rather than read from the environment: this module is
 * exported from the client-safe barrel, so it must not reach for the server env
 * schema. Each app passes the value from its own validated env.
 *
 * Absent cutoff ⇒ zero behavior change: nothing resolves to "clickhouse"
 * unless it already carries a `clickhouse` block.
 */
export function getBillingProvider(
  org: OrgWithCloudConfig,
  opts?: { cutoff?: Date | null; now?: Date },
): BillingProvider {
  if (org.cloudConfig?.clickhouse?.organizationId) return "clickhouse";
  if (
    org.cloudConfig?.stripe?.customerId ||
    org.cloudConfig?.stripe?.activeSubscriptionId
  )
    return "stripe";
  const cutoff = opts?.cutoff;
  if (cutoff && (opts?.now ?? new Date()).getTime() >= cutoff.getTime())
    return "clickhouse";
  return "stripe";
}

/**
 * True when the org holds paid billing state with any provider: an active
 * Stripe subscription, a manual plan override, or a CHB bundle. Used as the
 * paid gate for free-tier usage-threshold enforcement — a paying customer
 * must never be ingestion-blocked at the free-tier limit.
 */
export function hasPaidBillingState(org: OrgWithCloudConfig): boolean {
  return Boolean(
    org.cloudConfig?.stripe?.activeSubscriptionId ||
    org.cloudConfig?.plan ||
    org.cloudConfig?.clickhouse?.bundleId,
  );
}
