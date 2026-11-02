import { describe, it, expect, vi } from "vitest";

// getAuditRequestContext reads the trusted proxy count off `env` at call time,
// so the cases mutate mockEnv.env.
const mockEnv = vi.hoisted(() => ({
  env: { LANGFUSE_TRUSTED_PROXY_COUNT: 0 },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import { getAuditRequestContext } from "@/src/features/audit-logs/server";

describe("getAuditRequestContext client IP", () => {
  it.each([
    {
      name: "ignores X-Forwarded-For without trusted proxies",
      trustedProxyCount: 0,
      forwardedFor: "198.51.100.66",
      remoteAddress: "::ffff:203.0.113.7",
      expected: "203.0.113.7",
    },
    {
      name: "skips client-supplied entries left of the trusted proxy's entry",
      trustedProxyCount: 1,
      forwardedFor: "198.51.100.66, 203.0.113.7",
      remoteAddress: "10.0.0.1",
      expected: "203.0.113.7",
    },
    {
      name: "counts every trusted proxy from the right",
      trustedProxyCount: 2,
      forwardedFor: ["198.51.100.66, 203.0.113.7", "10.0.0.2"],
      remoteAddress: "10.0.0.1",
      expected: "203.0.113.7",
    },
    {
      name: "falls back to the left-most entry when the chain is shorter",
      trustedProxyCount: 3,
      forwardedFor: "203.0.113.7, 10.0.0.2",
      remoteAddress: "10.0.0.1",
      expected: "203.0.113.7",
    },
    {
      name: "uses the socket peer when no proxy forwarded the request",
      trustedProxyCount: 1,
      forwardedFor: undefined,
      remoteAddress: "203.0.113.7",
      expected: "203.0.113.7",
    },
    {
      name: "strips the port from an IPv4 entry",
      trustedProxyCount: 1,
      forwardedFor: "198.51.100.66, 203.0.113.7:4711",
      remoteAddress: "10.0.0.1",
      expected: "203.0.113.7",
    },
    {
      name: "strips brackets and port from an IPv6 entry",
      trustedProxyCount: 1,
      forwardedFor: "[2001:db8::7]:443",
      remoteAddress: "10.0.0.1",
      expected: "2001:db8::7",
    },
    {
      name: "drops an entry that is not an IP address",
      trustedProxyCount: 1,
      forwardedFor: "203.0.113.7, unknown",
      remoteAddress: "10.0.0.1",
      expected: undefined,
    },
  ])(
    "$name",
    ({ trustedProxyCount, forwardedFor, remoteAddress, expected }) => {
      mockEnv.env.LANGFUSE_TRUSTED_PROXY_COUNT = trustedProxyCount;

      const context = getAuditRequestContext(
        { "x-forwarded-for": forwardedFor, "user-agent": "curl/8.7.1" },
        remoteAddress,
      );

      expect(context.ip).toBe(expected);
      expect(context.userAgent).toBe("curl/8.7.1");
    },
  );
});
