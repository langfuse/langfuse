/**
 * The analytics exporters' redirect budget, and the destination rules that the
 * connect-time DNS hook cannot enforce (scheme, embedded credentials, IP
 * literals).
 *
 * No module mocks: this file needs the REAL redirect engine and the REAL
 * validator. The companion file analyticsIntegrationRedirectFaultReporting.test.ts
 * mocks the transport to inject chain faults, which is the opposite premise —
 * hence two files rather than one.
 *
 * SCOPE LIMIT, stated rather than approximated: the budget cannot be driven
 * end-to-end through a sender. Redirect hops are validated with the webhook
 * wrapper, whose port policy (80/443) runs BEFORE host validation and is not
 * bypassed by the allowlist, so every hop to a test server on an ephemeral port
 * is refused at hop 1 on the port rule — long before the budget matters — and
 * binding :80 needs root. The budget is therefore pinned against the shared
 * redirect engine using the surface's real constant.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { fetchWithSecureRedirects } from "@langfuse/shared/src/server";
import {
  ANALYTICS_INTEGRATION_MAX_REDIRECTS,
  validateAnalyticsIntegrationUrl,
} from "../features/analyticsIntegrationEgress";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});

/**
 * Serves /hop/N as a 302 to /hop/N-1, and /hop/0 as a 200. Starting at /hop/K
 * therefore costs exactly K redirects before delivery.
 */
async function startRedirectChainServer() {
  const server = createServer((req, res) => {
    const hop = Number(/\/hop\/(\d+)/.exec(req.url ?? "")?.[1] ?? "0");
    if (hop <= 0) {
      res.writeHead(200);
      res.end("delivered");
      return;
    }
    res.writeHead(302, { Location: `/hop/${hop - 1}` });
    res.end();
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  // An IP literal: the connect-time DNS hook does not fire for literals, so the
  // chain runs without the connect policy needing to permit loopback.
  return (hop: number) => `http://127.0.0.1:${port}/hop/${hop}`;
}

/** Budget-only harness: redirect-target validation is covered elsewhere. */
const budgetOnlyRedirectOptions = (maxRedirects: number) => ({
  maxRedirects,
  redirectValidation: {
    validateUrl: async () => undefined,
    whitelist: { hosts: [], ips: [], ip_ranges: [] },
    logContext: "Analytics integration",
  },
});

describe("analytics export redirect budget", () => {
  // The budget was raised because the pre-fix path followed up to 20 redirects
  // and dropping to 3 was flagged as a delivery regression. Pin the floor so it
  // cannot quietly go back; the exact value is free to move upward.
  it("keeps a redirect budget generous enough not to regress delivery", () => {
    expect(ANALYTICS_INTEGRATION_MAX_REDIRECTS).toBeGreaterThanOrEqual(10);
  });

  it("follows a chain that sits within the budget and delivers the response", async () => {
    const url = await startRedirectChainServer();

    const { response, redirectChain } = await fetchWithSecureRedirects(
      url(ANALYTICS_INTEGRATION_MAX_REDIRECTS),
      {},
      budgetOnlyRedirectOptions(ANALYTICS_INTEGRATION_MAX_REDIRECTS),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("delivered");
    expect(redirectChain).toHaveLength(ANALYTICS_INTEGRATION_MAX_REDIRECTS);
  }, 30_000);

  it("fails a chain that exceeds the budget", async () => {
    const url = await startRedirectChainServer();

    await expect(
      fetchWithSecureRedirects(
        url(ANALYTICS_INTEGRATION_MAX_REDIRECTS + 1),
        {},
        budgetOnlyRedirectOptions(ANALYTICS_INTEGRATION_MAX_REDIRECTS),
      ),
    ).rejects.toMatchObject({ name: "MaxRedirectsExceededError" });
  }, 30_000);
});

describe("analytics export destination validation", () => {
  const strict = { hosts: [], ips: [], ip_ranges: [] };

  /**
   * Returns the failure, or undefined when the call succeeded.
   *
   * Deliberately tolerant of both a synchronous throw and a rejected promise:
   * the validator is synchronous today, and the guarantees below are about the
   * outcome, not about which of the two it happens to be. `await` on a plain
   * value is a no-op, so this keeps working either way.
   */
  const failureOf = async (call: () => unknown): Promise<unknown> => {
    try {
      await call();
      return undefined;
    } catch (error) {
      return error;
    }
  };

  it.each(["ftp://example.test/import", "gopher://example.test/"])(
    "rejects the non-HTTP(S) destination %s",
    async (url) => {
      expect(
        await failureOf(() => validateAnalyticsIntegrationUrl(url, strict)),
      ).toBeDefined();
    },
  );

  it("treats a non-HTTP(S) scheme as a permanent fault", async () => {
    // A scheme cannot fix itself on retry, so it must not be left retryable.
    expect(
      isUnrecoverableError(
        await failureOf(() =>
          validateAnalyticsIntegrationUrl("ftp://example.test/import", strict),
        ),
      ),
    ).toBe(true);
  });

  it.each(["http://example.test/import", "https://example.test/import"])(
    "permits the HTTP(S) destination %s",
    async (url) => {
      expect(
        await failureOf(() => validateAnalyticsIntegrationUrl(url, strict)),
      ).toBeUndefined();
    },
  );

  // Same credential rule as the senders, asserted at the validator so the
  // guarantee does not depend on which caller happens to invoke it.
  it("rejects embedded credentials without echoing the password", async () => {
    const failure = await failureOf(() =>
      validateAnalyticsIntegrationUrl(
        "http://exporter:hunter2@example.test/import",
        strict,
      ),
    );

    expect(failure).toBeDefined();
    expect(String((failure as Error).message)).not.toContain("hunter2");
  });

  // This validator owns IP literals specifically, because the connect-time DNS
  // hook never fires for them.
  it.each([
    "http://127.0.0.1/import",
    "http://169.254.169.254/import",
    "http://10.0.0.1/import",
  ])("rejects the blocked IP-literal destination %s", async (url) => {
    expect(
      await failureOf(() => validateAnalyticsIntegrationUrl(url, strict)),
    ).toBeDefined();
  });

  // Positive control: the rejections above are policy, not a blanket refusal of
  // IP literals.
  it("permits an IP-literal destination the operator allowlisted", async () => {
    expect(
      await failureOf(() =>
        validateAnalyticsIntegrationUrl("http://10.0.0.1/import", {
          hosts: [],
          ips: ["10.0.0.1"],
          ip_ranges: [],
        }),
      ),
    ).toBeUndefined();
  });
});
