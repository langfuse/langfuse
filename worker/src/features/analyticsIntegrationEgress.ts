import {
  isIPAddress,
  logger,
  OutboundUrlValidationError,
  parseOutboundUrl,
  redactUrlCredentials,
  validateOutboundResolvedIp,
  validateWebhookURL,
  whitelistFromEnv,
  type OutboundUrlValidationWhitelist,
  type RedirectOptions,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../errors/UnrecoverableError";
import {
  describeOutboundFailure,
  findOutboundUrlValidationError,
} from "../errors/findOutboundUrlValidationError";

/**
 * Redirect budget for the analytics integration exporters. Both senders
 * previously used a plain fetch, which auto-follows up to 20 redirects, so the
 * budget stays generous enough not to break a self-hosted endpoint behind a
 * redirecting edge. Mirrors MAX_LLM_REDIRECTS on the LLM egress path.
 */
const ANALYTICS_INTEGRATION_MAX_REDIRECTS = 10;

/**
 * Connect-time-pinned egress settings shared by both analytics senders, so the
 * redirect budget, the validator and the whitelist source cannot drift apart
 * between them. `logContext` is the only per-sender part.
 */
export const buildAnalyticsRedirectOptions = (
  logContext: string,
): RedirectOptions => ({
  maxRedirects: ANALYTICS_INTEGRATION_MAX_REDIRECTS,
  redirectValidation: {
    validateUrl: validateWebhookURL,
    whitelist: whitelistFromEnv(),
    logContext,
  },
});

/**
 * Hostname of a configured URL, for log lines and notifications.
 *
 * Never log the configured URL itself: it can carry credentials
 * (`http://user:pass@host`), and the rejection path fires exactly when the
 * URL was refused — including when it was refused for carrying them. The
 * hostname component cannot contain userinfo.
 *
 * Uses `new URL` rather than `parseOutboundUrl` deliberately: this is
 * redaction, not validation, and `parseOutboundUrl` refuses a credentialed
 * URL outright, so it cannot extract a safe hostname from the case that
 * matters most.
 */
export function hostnameForLog(configuredUrl: string): string {
  try {
    return new URL(configuredUrl).hostname || "<no hostname>";
  } catch {
    return "<unparsable>";
  }
}

/**
 * Use-time destination check for the analytics exporters. Covers exactly what
 * the connect-time DNS lookup hook structurally cannot see, and nothing more:
 *
 *  - IP-literal hosts. Node skips DNS for a literal, so the connect-time
 *    lookup never fires and the address reaches the socket unchecked.
 *    `fetchWithSecureRedirects` validates Location targets, not the initial
 *    URL. Without this check, any region/baseUrl that yields an IP literal
 *    (e.g. `http://169.254.169.254/`) would receive the exported events and
 *    the Authorization header.
 *  - String-level faults no network check can catch: embedded credentials,
 *    bad encoding, a non-HTTP(S) scheme.
 *
 * DNS-named hosts are deliberately not policed here. The connect-time lookup
 * re-validates every IP the name actually resolves to, at connect, which is
 * strictly stronger than a string pre-check.
 *
 * Not routed through `validateWebhookURL`: that wrapper also imposes the
 * webhook surface's port policy (80/443 only), which the exporters do not
 * have. Ports stay unrestricted because host/IP policy, not the port, is
 * what confines this egress. Redirect targets keep the stricter default.
 *
 * Uses the webhook allowlist on purpose: allowing a host for webhook
 * delivery also allows analytics exports to it. Splitting the lists is a
 * separate operator-facing change.
 */
export function validateAnalyticsIntegrationUrl(
  urlString: string,
  whitelist: OutboundUrlValidationWhitelist = whitelistFromEnv(),
): void {
  // parseOutboundUrl (not new URL) so embedded credentials and bad encoding
  // are refused without echoing the URL — undici's own guard echoes it,
  // which would put the password in worker logs.
  const url = parseOutboundUrl(urlString);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new OutboundUrlValidationError(
      "protocol-not-allowed",
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

/**
 * A serialization-safe stand-in for the validation error. The original holds the
 * offending URL three times over — in its message, in its stack, and, for a
 * rejected redirect, in an enumerable `redirectUrl` field — and the generic
 * queue failure handler both logs the thrown error and reports it to tracing,
 * so everything reachable from `cause` is written out verbatim.
 */
const sanitizedCause = (validationError: Error): Error => {
  const sanitized = new Error(redactUrlCredentials(validationError.message));
  sanitized.name = validationError.name;
  if (validationError.stack) {
    sanitized.stack = redactUrlCredentials(validationError.stack);
  }
  return sanitized;
};

/**
 * Rethrow a permanent outbound-URL failure — a connect-time SSRF block, or a
 * redirect chain that exhausted its budget or looped — as terminal, so BullMQ
 * stops re-attempting a send that cannot succeed; no-op for anything else,
 * which the caller keeps handling as retryable.
 *
 * Nothing the thrown error carries may hold a credential: the message, the
 * retained cause and that cause's own stack all outlive the job, via the log
 * line and via the `failedReason` BullMQ persists.
 */
export function rethrowIfOutboundValidationFailure(
  error: unknown,
  labels: { logSubject: string; jobSubject: string },
): void {
  const validationError = findOutboundUrlValidationError(error);
  if (!validationError) return;

  const reason = redactUrlCredentials(validationError.message);
  const description = describeOutboundFailure(validationError);
  logger.error(`${labels.logSubject} ${description}: ${reason}`, {
    errorName: validationError.name,
  });

  const unrecoverable = new UnrecoverableError(
    `${labels.jobSubject} ${description}: ${reason}`,
  );
  // Non-enumerable, because a structured logger handed this error copies every
  // enumerable field into the log line — which is how the raw URL escaped a
  // redacted message before.
  Object.defineProperty(unrecoverable, "cause", {
    value: sanitizedCause(validationError),
    enumerable: false,
    configurable: true,
    writable: true,
  });
  throw unrecoverable;
}
