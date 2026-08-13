/**
 * The allowlisted counterpart to analyticsIntegrationOutboundUrlNegative.test.ts.
 *
 * That file proves an EMPTY allowlist permits no internal target. This one
 * proves the other half of the same rule: when a self-hosted operator DOES
 * allowlist a host, the export still delivers end to end. Both halves are
 * required by `.agents/skills/security-review/references/outbound-url-validation.md`.
 *
 * It needs LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_HOST set before shared's
 * env module is parsed, which conflicts with the strict premise of the negative
 * suite — hence a separate file rather than a nested describe.
 *
 * Note the allowlist is this surface's OWN trio
 * (LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_*), not the webhook trio. A test
 * that allowlisted the webhook host would pass vacuously if the exporters ever
 * regressed to borrowing another surface's allowlist, so asserting through the
 * dedicated accessor is part of the point.
 *
 * This is also the Mixpanel positive control for criterion #4 ("legitimate
 * hosts still send successfully"). It replaces an earlier IP-literal control
 * that had to be retired: an IP literal only delivered because the connect-time
 * DNS hook never fires for literals, which use-time validation now (correctly)
 * refuses. Allowlisting a DNS-named host is the honest way to exercise the
 * success path — it proves gzip request body, the secure-outbound dispatcher and
 * response handling all still work, without depending on the very gap the fix
 * closes, and without adding a production seam.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

// Runs before the module imports below, so shared's env picks these up.
vi.hoisted(() => {
  process.env.LANGFUSE_ANALYTICS_INTEGRATION_WHITELISTED_HOST = "localhost";
});

vi.mock("../env", () => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy",
    LANGFUSE_POSTHOG_FLUSH_DELAY_MS: 0,
    LANGFUSE_MIXPANEL_FLUSH_DELAY_MS: 0,
    LANGFUSE_MIXPANEL_TIMEOUT_MS: 10_000,
  },
  v4WritesToLegacyTables: () => true,
  v4WritesToEventsTable: () => false,
}));

import { analyticsIntegrationWhitelistFromEnv } from "../features/analyticsIntegrationEgress";
import { MixpanelClient } from "../features/mixpanel/mixpanelClient";
import type { MixpanelEvent } from "../features/mixpanel/transformers";

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});

async function startRecordingServer() {
  const received: Array<{ encoding?: string; bytes: number }> = [];
  const server = createServer((req, res) => {
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
    });
    req.on("end", () => {
      received.push({
        encoding: req.headers["content-encoding"] as string | undefined,
        bytes,
      });
      res.end("{}");
    });
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { received, port: (server.address() as AddressInfo).port };
}

describe("allowlisted outbound destination", () => {
  // Guard on the harness itself: if the env plumbing silently stopped working,
  // the delivery test below would fail for an unrelated reason and send someone
  // hunting a phantom regression in the client.
  it("reads the operator allowlist from this surface's own environment trio", () => {
    expect(analyticsIntegrationWhitelistFromEnv().hosts).toContain("localhost");
  });

  // Criterion #4 for Mixpanel: an allowlisted DNS-named host still delivers,
  // exercising gzip request body + secure-outbound dispatcher + response
  // handling. No IP literal involved.
  it("delivers a gzipped Mixpanel batch to an allowlisted host", async () => {
    const { received, port } = await startRecordingServer();

    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: `http://localhost:${port}`,
    });
    client.addEvent({
      event: "trace",
      properties: { token: "t", distinct_id: "1", $insert_id: 1 },
    } as unknown as MixpanelEvent);

    await client.flush();

    expect(received).toHaveLength(1);
    expect(received[0].encoding).toBe("gzip");
    expect(received[0].bytes).toBeGreaterThan(0);
    // The client also reports on-wire volume for the export metric.
    expect(client.getSerializedBytes()).toBeGreaterThan(0);
  }, 30_000);
});
