import { type CloudConfigSchema } from "../../interfaces/cloudConfigSchema";

/**
 * Billable units an org on the enterprise trial may ingest per billing cycle.
 * Ingestion is blocked once usage reaches it.
 */
export const ENTERPRISE_TRIAL_UNIT_LIMIT = 250_000;

/** How long an enterprise trial lasts after it is redeemed. */
export const ENTERPRISE_TRIAL_DURATION_DAYS = 60;

/** Whether the org's enterprise trial has started and not yet ended. */
export function isEnterpriseTrialActive(
  cloudConfig: Pick<CloudConfigSchema, "enterpriseTrial"> | null | undefined,
  now: Date = new Date(),
): boolean {
  const endsAt = cloudConfig?.enterpriseTrial?.endsAt;
  return Boolean(endsAt && new Date(endsAt).getTime() > now.getTime());
}
