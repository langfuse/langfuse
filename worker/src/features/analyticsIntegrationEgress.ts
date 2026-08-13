import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  isIPAddress,
  parseOutboundUrl,
  validateOutboundResolvedIp,
  type OutboundUrlValidationWhitelist,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../errors/UnrecoverableError";

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
/**
 * Redirect budget for analytics exports.
 *
 * Both senders previously used a plain fetch, which auto-follows up to 20
 * redirects, so the budget must stay generous enough not to break a
 * self-hosted endpoint behind a redirecting edge (vanity host → canonical host
 * → regional host → /batch/). Mirrors MAX_LLM_REDIRECTS on the LLM path:
 * bounded, but close to the platform's prior behavior.
 */
export const ANALYTICS_INTEGRATION_MAX_REDIRECTS = 10;

export function analyticsIntegrationWhitelistFromEnv(): OutboundUrlValidationWhitelist {
  return {
    hosts: sharedEnv.LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_HOST || [],
    ips: sharedEnv.LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_IPS || [],
    ip_ranges:
      sharedEnv.LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_IP_SEGMENTS || [],
  };
}

/**
 * Use-time destination check for this surface. Covers exactly what the
 * connect-time hook structurally cannot see, and nothing more:
 *
 *  - IP-LITERAL hosts. net.connect skips DNS for a literal, so the connect
 *    lookup never fires and the address reaches the socket unchecked.
 *    fetchWithSecureRedirects validates Location targets, not the initial URL.
 *    Without this check, any region/baseUrl yielding an IP literal (e.g. a
 *    region of "169.254.169.254#", which WHATWG parses as hostname
 *    169.254.169.254) would receive the exported events and the Authorization
 *    header.
 *  - String-level faults that no network check can catch: embedded credentials,
 *    bad encoding, a non-HTTP(S) scheme.
 *
 * DNS-NAMED hosts are deliberately NOT policed here. The connect-time lookup
 * re-validates every IP the name actually resolves to, at connect, which is
 * strictly stronger than a string pre-check: a name that passes a pre-check can
 * still rebind before the socket opens (the TOCTOU gap this whole change
 * closes). Adding a name pre-check here would duplicate the weaker half and
 * cost a DNS resolution per batch.
 *
 * Deliberately NOT validateWebhookURL: that wrapper imposes the webhook
 * surface's port policy (80/443 only), which does not belong to analytics
 * egress, and reusing another surface's wrapper is the same coupling the
 * dedicated allowlist above removes. Ports are unrestricted because host/IP
 * policy, not the port, is what confines egress.
 */
export function validateAnalyticsIntegrationUrl(
  urlString: string,
  whitelist: OutboundUrlValidationWhitelist = analyticsIntegrationWhitelistFromEnv(),
): void {
  // parseOutboundUrl (not new URL) so embedded credentials and bad encoding are
  // refused without echoing the URL — undici's own guard echoes it, which would
  // put the password in worker logs.
  const url = parseOutboundUrl(urlString);

  if (!["http:", "https:"].includes(url.protocol)) {
    // Permanent config fault, so terminal. Thrown from this module rather than
    // as an OutboundUrlValidationError to avoid importing an error class purely
    // to construct it.
    throw new UnrecoverableError(
      `Only HTTP and HTTPS protocols are allowed for analytics integration exports, got ${url.protocol}`,
    );
  }

  if (!isIPAddress(url.hostname)) return;

  validateOutboundResolvedIp({
    hostname: url.hostname,
    ip: url.hostname,
    whitelist,
    logContext: "Analytics integration",
  });
}
