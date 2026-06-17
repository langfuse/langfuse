import type { NextApiRequest } from "next";
import {
  allowSlackMarketplaceInstall,
  SlackMarketplaceInstallRateLimiter,
} from "@/src/features/slack/server/marketplaceInstallRateLimit";

const POINTS = 30;

function reqWithIp(ip: string): NextApiRequest {
  return {
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  } as unknown as NextApiRequest;
}

describe("SlackMarketplaceInstallRateLimiter", () => {
  // Reset the singleton (and disconnect Redis) between cases so each test gets a
  // fresh limiter and the test process doesn't leak an open Redis handle.
  afterEach(() => {
    SlackMarketplaceInstallRateLimiter.shutdown();
  });

  it("fails open when Redis is not configured (injected null)", async () => {
    const limiter = SlackMarketplaceInstallRateLimiter.getInstance(null);
    for (let i = 0; i < POINTS + 5; i++) {
      expect(await limiter.allow(reqWithIp("no-redis-ip"))).toBe(true);
    }
  });

  // The following two cases hit the dev Redis. Each uses a unique IP so keys
  // don't carry over between runs (they expire after the 5-minute window).
  it("allows up to the limit, then blocks the same IP", async () => {
    const ip = `rl-test-${Date.now()}-a`;
    for (let i = 0; i < POINTS; i++) {
      expect(await allowSlackMarketplaceInstall(reqWithIp(ip))).toBe(true);
    }
    expect(await allowSlackMarketplaceInstall(reqWithIp(ip))).toBe(false);
  });

  it("limits each IP independently", async () => {
    const ipA = `rl-test-${Date.now()}-b`;
    const ipB = `rl-test-${Date.now()}-c`;

    for (let i = 0; i < POINTS; i++) {
      expect(await allowSlackMarketplaceInstall(reqWithIp(ipA))).toBe(true);
    }
    expect(await allowSlackMarketplaceInstall(reqWithIp(ipA))).toBe(false);

    // a different IP still has its full allowance
    expect(await allowSlackMarketplaceInstall(reqWithIp(ipB))).toBe(true);
  });
});
