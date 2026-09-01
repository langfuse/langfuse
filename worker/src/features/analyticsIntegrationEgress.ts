/**
 * Hostname of a configured URL, for log lines.
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
