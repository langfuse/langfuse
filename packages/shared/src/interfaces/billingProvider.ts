import { type CloudConfigSchema } from "./cloudConfigSchema";

export type BillingProvider = "stripe" | "clickhouse";

type OrgWithCloudConfig = {
  cloudConfig: CloudConfigSchema | null | undefined;
};

/**
 * Parse the ClickHouse Billing cutoff instant from the environment.
 *
 * First-time upgrades on/after this instant route to CHB; unset (or
 * unparsable) means the CHB path is off entirely. Read lazily so web and
 * worker share one implementation and tests can vary the env — format
 * validation happens loudly in each app's env schema, so an invalid value
 * here only ever fails closed to Stripe.
 */
export function getChbCutoffDate(): Date | null {
  const raw = process.env.LANGFUSE_CLOUD_BILLING_CHB_CUTOFF_DATE;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Resolve which billing provider owns an organization.
 *
 * Decision order (see CHB integration plan §3.1):
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
 * Unset cutoff ⇒ zero behavior change: nothing resolves to "clickhouse"
 * unless it already carries a `clickhouse` block.
 */
export function getBillingProvider(
  org: OrgWithCloudConfig,
  opts?: { now?: Date },
): BillingProvider {
  if (org.cloudConfig?.clickhouse?.organizationId) return "clickhouse";
  if (
    org.cloudConfig?.stripe?.customerId ||
    org.cloudConfig?.stripe?.activeSubscriptionId
  )
    return "stripe";
  const cutoff = getChbCutoffDate();
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
