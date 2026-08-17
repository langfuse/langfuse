/**
 * Connect-time SSRF pinning for the PostHog and Mixpanel analytics exporters.
 *
 * Both sender tests neutralise the string pre-check (that models "the host
 * validated as public") and point the send at a `localhost` NAME, whose
 * connect-time lookup re-resolves to 127.0.0.1 (that models "it rebinds at
 * connect"). Pointing them at a statically-blocked host instead would pass even
 * without connect-time pinning, which is why they are shaped this way.
 *
 * The PostHog leg is exercised through `countingFetch`, the transport the
 * handler injects into the SDK, rather than through the handler itself: on this
 * branch's posthog-node, `flush()` does not drain the queue — the send happens
 * on the SDK's own background timer, after the handler has already returned — so
 * the handler cannot observe the send outcome and a handler-level assertion
 * would pass whether or not the egress is pinned. `countingFetch` is the seam
 * every PostHog export byte goes through, so it is where the guarantee lives.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isUnrecoverableError } from "../errors/UnrecoverableError";
import { findOutboundUrlValidationError } from "../errors/findOutboundUrlValidationError";

// The senders read their allowlist from the environment, and vitest loads
// ../.env. A developer who allowlists localhost for local webhook testing would
// otherwise turn the block assertions below into mystery failures.
vi.hoisted(() => {
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_HOST;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IPS;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IP_SEGMENTS;
});

const openServers: Server[] = [];

async function startLoopbackServer(
  onRequest: () => void,
): Promise<{ nameUrl: string; port: number }> {
  const server = createServer((_req, res) => {
    onRequest();
    res.end("{}");
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { nameUrl: `http://localhost:${port}`, port };
}

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
  vi.restoreAllMocks();
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { posthogIntegration: { findFirst: vi.fn(), update: vi.fn() } },
}));

// Keep the REAL secure-outbound egress helpers; silence only the logger.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getCurrentSpan: vi.fn(() => undefined),
  };
});

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "phc_decrypted"),
}));

vi.mock("../env", () => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy",
  },
  v4WritesToLegacyTables: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only",
  v4WritesToEventsTable: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
}));

// Imported after mocks are registered.
import { countingFetch } from "../features/posthog/handlePostHogIntegrationProjectJob";
import {
  OutboundUrlValidationError,
  RedirectValidationError,
} from "@langfuse/shared/src/server";
import { rethrowIfOutboundValidationFailure } from "../features/analyticsIntegrationEgress";
import { MixpanelClient } from "../features/mixpanel/mixpanelClient";
import type { MixpanelEvent } from "../features/mixpanel/transformers";

function causeChainIncludes(error: unknown, needle: string): boolean {
  let current: any = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current.message === "string" && current.message.includes(needle))
      return true;
    current = current.cause;
  }
  return false;
}

describe("PostHog export transport — SSRF connect-time pinning", () => {
  it("blocks a validated host that resolves to a blocked IP before egress", async () => {
    let requestCount = 0;
    const { nameUrl, port } = await startLoopbackServer(() => {
      requestCount++;
    });

    // Negative control: the pre-fix path (bare global fetch) reaches the server,
    // so a later count of 0 proves the pinning blocked the send rather than the
    // harness being unreachable.
    await fetch(`http://localhost:${port}/batch/`, {
      method: "POST",
      body: "{}",
    });
    expect(requestCount).toBe(1);

    const volume = { bytes: 0 };
    const send = countingFetch(volume);

    let thrown: unknown;
    try {
      await send!(`${nameUrl}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      } as unknown as Parameters<NonNullable<typeof send>>[1]);
    } catch (error) {
      thrown = error;
    }

    // Still 1: the export send never reached the wire.
    expect(requestCount).toBe(1);
    expect(thrown).toBeDefined();
    // Non-vacuous: only an OutboundUrlValidationError carrying `blocked-ip` (or
    // `blocked-hostname`) produces this message, and the host passes the string
    // pre-check, so it can only have come from the connect-time lookup.
    expect(causeChainIncludes(thrown, "Blocked IP address detected")).toBe(
      true,
    );
    // The block is classified terminal, so the caller stops re-attempting it.
    expect(findOutboundUrlValidationError(thrown)).toBeDefined();
  }, 40_000);
});

describe("Mixpanel sender — SSRF connect-time pinning", () => {
  it("rejects a validated host that connects to a blocked IP, before egress and terminally", async () => {
    let requestCount = 0;
    const { nameUrl, port } = await startLoopbackServer(() => {
      requestCount++;
    });

    // Negative control, as above.
    await fetch(`http://localhost:${port}/import?strict=1`, {
      method: "POST",
      body: "[]",
    });
    expect(requestCount).toBe(1);

    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: nameUrl,
    });
    client.addEvent({
      event: "trace",
      properties: { token: "t", distinct_id: "1", $insert_id: 1 },
    } as unknown as MixpanelEvent);

    let thrown: unknown;
    try {
      await client.flush();
    } catch (error) {
      thrown = error;
    }

    expect(requestCount).toBe(1);
    expect(thrown).toBeDefined();
    expect(isUnrecoverableError(thrown)).toBe(true);
    expect(causeChainIncludes(thrown, "Blocked IP address detected")).toBe(
      true,
    );
  }, 40_000);
});

describe("outbound validation classification", () => {
  it("treats a DNS lookup failure as retryable and a blocked IP as terminal", () => {
    const wrap = (cause: Error) =>
      Object.assign(new TypeError("fetch failed"), { cause });

    expect(
      findOutboundUrlValidationError(
        wrap(
          new OutboundUrlValidationError(
            "dns-lookup-failed",
            "DNS lookup failed for exporter.example.com",
          ),
        ),
      ),
    ).toBeUndefined();

    expect(
      findOutboundUrlValidationError(
        wrap(
          new OutboundUrlValidationError(
            "blocked-ip",
            "Blocked IP address detected: 127.0.0.1",
          ),
        ),
      ),
    ).toBeDefined();
  });
});

/**
 * Everything a structured logger or tracer can pull off a thrown error: its
 * enumerable own fields (winston copies those into the JSON log line), its
 * message, its stack, and the same again for each `cause` a chain-walking
 * reporter follows. A credential must appear in none of them.
 */
function serializableSurface(error: unknown): string {
  const parts: string[] = [];
  let current: any = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    parts.push(JSON.stringify({ ...current }));
    if (typeof current.message === "string") parts.push(current.message);
    if (typeof current.stack === "string") parts.push(current.stack);
    current = current.cause;
  }
  return parts.join("\n");
}

function captureRethrow(error: unknown): unknown {
  try {
    rethrowIfOutboundValidationFailure(error, {
      logSubject: "Mixpanel outbound send",
      jobSubject: "Mixpanel export",
    });
  } catch (caught) {
    return caught;
  }
  return undefined;
}

describe("terminal outbound failure reporting", () => {
  // The rejected redirect target is embedded verbatim in the validation error —
  // in its message, its stack, and its enumerable `redirectUrl` field — so a
  // credentialed Location header would otherwise reach the log line and
  // BullMQ's persisted failedReason.
  const credentialedRedirect = () =>
    Object.assign(new TypeError("fetch failed"), {
      cause: new RedirectValidationError(
        "Blocked IP address detected: 169.254.169.254",
        "http://exporter:hunter2@169.254.169.254/",
        0,
      ),
    });

  it("redacts credentials from a rejected redirect target", () => {
    const thrown = captureRethrow(credentialedRedirect());

    expect(isUnrecoverableError(thrown)).toBe(true);
    const message = (thrown as Error).message;
    expect(message).not.toContain("hunter2");
    expect(message).toContain("http://***@169.254.169.254/");
    // The diagnostic reason must survive redaction, otherwise the operator
    // cannot tell a blocked IP from a rejected scheme.
    expect(message).toContain("Blocked IP address detected: 169.254.169.254");
  });

  it("keeps credentials out of every field a logger or tracer can serialize", () => {
    const thrown = captureRethrow(credentialedRedirect());

    // Redacting only the message is not enough: the queue's generic `failed`
    // handler passes the whole error to the logger and to traceException, so a
    // raw error retained as an enumerable `cause` leaks the URL anyway.
    expect(serializableSurface(thrown)).not.toContain("hunter2");
    expect(serializableSurface(thrown)).not.toContain(
      "exporter:hunter2@169.254.169.254",
    );
    // Non-vacuous: the redacted reason really is reachable on that surface.
    expect(serializableSurface(thrown)).toContain(
      "Blocked IP address detected: 169.254.169.254",
    );
  });

  it("does not expose the retained cause as an enumerable field", () => {
    const thrown = captureRethrow(credentialedRedirect());

    expect((thrown as Error).cause).toBeDefined();
    expect(Object.keys(thrown as object)).not.toContain("cause");
  });

  it("leaves a credential-free message untouched and stays a no-op for other errors", () => {
    expect(() =>
      rethrowIfOutboundValidationFailure(new Error("connection reset"), {
        logSubject: "Mixpanel outbound send",
        jobSubject: "Mixpanel export",
      }),
    ).not.toThrow();

    expect(() =>
      rethrowIfOutboundValidationFailure(
        new OutboundUrlValidationError(
          "blocked-ip",
          "Blocked IP address detected: 127.0.0.1",
        ),
        { logSubject: "Mixpanel outbound send", jobSubject: "Mixpanel export" },
      ),
    ).toThrow("Blocked IP address detected: 127.0.0.1");
  });
});
