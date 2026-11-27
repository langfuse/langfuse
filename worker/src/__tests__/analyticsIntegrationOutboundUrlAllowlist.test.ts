/**
 * Allowlisted counterpart to analyticsIntegrationOutboundUrlNegative.test.ts.
 *
 * That file proves an empty allowlist permits no internal target. This one
 * proves the other half: when a self-hosted operator allowlists a host, the
 * Mixpanel export still delivers. Needs LANGFUSE_WEBHOOK_WHITELISTED_HOST
 * set before shared's env module is parsed, so it lives in its own file.
 *
 * Analytics exports share the webhook allowlist on purpose: allowing a host
 * for webhook delivery also allows exports to it.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LANGFUSE_WEBHOOK_WHITELISTED_HOST = "localhost";
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

import { whitelistFromEnv } from "@langfuse/shared/src/server";
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
  it("reads the operator allowlist through the accessor production uses", () => {
    expect(whitelistFromEnv().hosts).toContain("localhost");
  });

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
    expect(client.getSerializedBytes()).toBeGreaterThan(0);
  }, 30_000);
});
