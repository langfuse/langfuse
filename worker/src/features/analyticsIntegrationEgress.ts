import { env as sharedEnv } from "@langfuse/shared/src/env";
import type { OutboundUrlValidationWhitelist } from "@langfuse/shared/src/server";

/**
 * Connect-time egress policy for the analytics integration exporters (PostHog,
 * Mixpanel).
 *
 * This surface keeps its OWN allowlist rather than borrowing the webhook trio:
 * sharing another surface's allowlist means an operator who allows an internal
 * range for a webhook receiver silently also allows analytics exports into it,
 * and a project admin could then point an export host at an internal service.
 * See .agents/skills/security-review/references/outbound-url-validation.md
 * step 3 ("Do not share another surface's allowlist; each surface keeps its
 * own").
 *
 * Unset env means an empty allowlist, i.e. strict: no internal target is
 * permitted. Operators who legitimately export to a private network target
 * must opt in explicitly.
 */
export function analyticsIntegrationWhitelistFromEnv(): OutboundUrlValidationWhitelist {
  return {
    hosts: sharedEnv.LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_HOST || [],
    ips: sharedEnv.LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_IPS || [],
    ip_ranges:
      sharedEnv.LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_IP_SEGMENTS || [],
  };
}
