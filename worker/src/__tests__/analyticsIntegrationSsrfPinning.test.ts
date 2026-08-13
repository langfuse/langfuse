/**
 * SSRF connect-time pinning for the PostHog and Mixpanel analytics exporters.
 *
 * Both senders used to validate the configured host once and then send over an
 * unpinned fetch. That is a check-then-use (TOCTOU) gap: a host answering a
 * public IP during validation can rebind to a private/loopback address by the
 * time the socket connects, bypassing the SSRF check. Egress now runs through
 * the shared connect-time-pinned secure-outbound infra, so every resolved IP is
 * re-validated at connect.
 *
 * Contract under test (verbatim acceptance criteria):
 *   1. A host that validates as public but rebinds to a blocked IP at connect
 *      time is rejected BEFORE any data leaves the worker, for BOTH PostHog
 *      and Mixpanel.
 *   2. Egress reuses the shared secure-outbound infra (no new bespoke SSRF
 *      logic).
 *   3. A connect-time SSRF rejection makes the export job fail TERMINALLY: it
 *      surfaces as an error named "UnrecoverableError" (the marker BullMQ
 *      checks to suppress retries).
 *   4. Legitimate public hosts still send successfully (no regression).
 *
 * Infra-free: no Redis/ClickHouse/Postgres/MinIO. A localhost HTTP server plus
 * the shared secure-outbound egress under a strict whitelist stands in for a
 * public host that resolves to a blocked/loopback IP.
 *
 * WHY THESE TESTS ARE SHAPED THIS WAY (do not "simplify" this):
 *   Both senders validate the configured host as a *string* first, so a
 *   statically-blocked host is rejected at validate time — that is NOT the gap
 *   this fix closes, and a test pointed at such a host would pass even without
 *   connect-time pinning. The gap is the connect-time re-resolution. So each
 *   fix-detector neutralises the pre-fetch defense (models "the host validated
 *   as public") and points the send at a `localhost` NAME, whose connect-time
 *   lookup re-resolves to 127.0.0.1 (models "it rebinds to a blocked IP at
 *   connect"). Only connect-time pinning blocks that; a validate-only fix
 *   leaves these RED, which is correct per criterion #1.
 *
 *   PostHog: the string validator (validateWebhookURL) is mocked to a no-op.
 *   Mixpanel: driven through the test-only `baseUrl` seam on
 *   MixpanelClientConfig (production still defaults to
 *   https://<region>.mixpanel.com).
 *
 * NON-VACUITY: "no egress" assertions are only meaningful if the harness would
 * otherwise have been reached. The Mixpanel test therefore fires a bare global
 * fetch — the pre-fix send path — at the exact URL the client targets and
 * asserts it lands; and it asserts the terminal error is caused BY the SSRF
 * block, so an unrelated early throw cannot fake a pass.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostHog } from "posthog-node";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

// The senders' own allowlist comes from the environment, and vitest loads
// ../.env. A developer who allowlists localhost for local webhook testing would
// otherwise turn the block assertions below into mystery failures. The oracles
// pass STRICT_WHITELIST explicitly, but the two sender-level tests cannot.
vi.hoisted(() => {
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_HOST;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IPS;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IP_SEGMENTS;
});

const STRICT_WHITELIST = { hosts: [], ips: [], ip_ranges: [] };

const openServers: Server[] = [];

/**
 * A localhost HTTP server. Returns both a DNS-name URL (`localhost`, so the
 * connect-time lookup hook fires and re-validates the resolved 127.0.0.1) and
 * an IP-literal URL (`127.0.0.1`, for which the connect hook does NOT fire).
 */
async function startLoopbackServer(
  onRequest: () => void,
  respond: (res: import("node:http").ServerResponse) => void = (res) =>
    res.end("ok"),
): Promise<{ nameUrl: string; literalUrl: string; port: number }> {
  const server = createServer((_req, res) => {
    onRequest();
    respond(res);
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    nameUrl: `http://localhost:${port}`,
    literalUrl: `http://127.0.0.1:${port}`,
    port,
  };
}

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// PostHog handler suite — the fix-detector (was RED pre-fix: the export
// reached the loopback server, the job resolved, and the cursor advanced).
// posthog-node is intentionally NOT mocked: the real SDK issues the real send
// through the handler's own outbound fetch, so connect-time pinning (or its
// absence) is exercised end to end, including the handler's error mapping.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const posthogIntegrationUpdate = vi.fn();
  // Only scores yields, so the first flush attempts the (blocked) send and the
  // handler stops — bounding runtime.
  const oneRow = () =>
    (async function* () {
      yield { langfuse_id: "row-1" };
    })();
  const noRows = () => (async function* () {})();
  const integration = () => ({
    projectId: "project-1",
    enabled: true,
    exportSource: "TRACES_OBSERVATIONS",
    posthogHostName: "http://placeholder.invalid",
    encryptedPosthogApiKey: "enc",
    lastSyncAt: new Date("2024-01-01"),
    project: { name: "Test Project", createdAt: new Date("2023-01-01") },
  });
  const db = { integration: integration() as Record<string, unknown> };
  return { posthogIntegrationUpdate, oneRow, noRows, integration, db };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    posthogIntegration: {
      findFirst: vi.fn(async () => h.db.integration),
      update: h.posthogIntegrationUpdate,
    },
  },
}));

// Keep the REAL secure-outbound egress helpers; override only the data-stream
// sources, the logger, and validateWebhookURL. Neutralising validateWebhookURL
// models a host that passed string validation (the TOCTOU precondition) so the
// only remaining defense is connect-time pinning.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getCurrentSpan: vi.fn(() => undefined),
    recordIncrement: vi.fn(),
    validateWebhookURL: vi.fn(async () => {}),
    getTracesForAnalyticsIntegrations: vi.fn(() => h.noRows()),
    getGenerationsForAnalyticsIntegrations: vi.fn(() => h.noRows()),
    getScoresForAnalyticsIntegrations: vi.fn(() => h.oneRow()),
    getEventsForAnalyticsIntegrations: vi.fn(() => h.noRows()),
  };
});

// Transformers must return a payload the real posthog-node capture() accepts.
vi.mock("../features/posthog/transformers", () => {
  const payload = () => ({
    distinctId: "p",
    event: "langfuse",
    properties: {},
  });
  return {
    transformTraceForPostHog: vi.fn(payload),
    transformGenerationForPostHog: vi.fn(payload),
    transformScoreForPostHog: vi.fn(payload),
    transformEventForPostHog: vi.fn(payload),
  };
});

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "phc_decrypted"),
}));

vi.mock("../env", () => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy",
    LANGFUSE_POSTHOG_FLUSH_DELAY_MS: 0,
    // Real defaults (worker/src/env.ts). The timeout must be present, else the
    // Mixpanel abort timer fires at ~0ms and masks the SSRF block with a
    // spurious timeout error.
    LANGFUSE_MIXPANEL_FLUSH_DELAY_MS: 0,
    LANGFUSE_MIXPANEL_TIMEOUT_MS: 30_000,
  },
  v4WritesToLegacyTables: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only",
  v4WritesToEventsTable: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
}));

// Imported after mocks are registered.
import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";
import {
  addSecureOutboundConnectionValidation,
  createSecureOutboundLookup,
  fetchWithSecureRedirects,
} from "@langfuse/shared/src/server";
import { MixpanelClient } from "../features/mixpanel/mixpanelClient";
import type { MixpanelEvent } from "../features/mixpanel/transformers";

function makeJob() {
  return {
    data: { id: "job-1", payload: { projectId: "project-1" } },
    attemptsMade: 0,
  } as unknown as Parameters<typeof handlePostHogIntegrationProjectJob>[0];
}

/** Walk an error's `cause` chain looking for the SSRF block signature. */
function causeChainIncludes(error: unknown, needle: string): boolean {
  let current: any = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current.message === "string" && current.message.includes(needle))
      return true;
    current = current.cause;
  }
  return false;
}

describe("PostHog integration project job — SSRF connect-time pinning", () => {
  beforeEach(() => {
    h.posthogIntegrationUpdate.mockClear();
    h.db.integration = h.integration();
  });

  it("rejects a validated host that connects to a blocked IP, before egress and terminally", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });
    // Passed string validation (validateWebhookURL is neutralised) but the
    // send resolves to a blocked/loopback IP at connect time.
    h.db.integration.posthogHostName = nameUrl;

    let thrown: unknown;
    try {
      await handlePostHogIntegrationProjectJob(makeJob());
    } catch (error) {
      thrown = error;
    }

    // Criterion #1: no bytes left the worker.
    expect(requestCount).toBe(0);
    // Criterion #3: the job failed terminally (BullMQ suppresses retries).
    expect(thrown).toBeDefined();
    expect(isUnrecoverableError(thrown)).toBe(true);
    // The terminal error must be caused BY the SSRF block. Without this, ANY
    // UnrecoverableError raised anywhere before the first socket write would
    // satisfy the three assertions above and the test would go vacuous. Asserts
    // the cause-chain MESSAGE rather than an error class, so it survives
    // changes to how the block is classified or wrapped.
    expect(causeChainIncludes(thrown, "Blocked IP address detected")).toBe(
      true,
    );
    // The sync cursor must not advance on a blocked run.
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  }, 40_000);
});

// ---------------------------------------------------------------------------
// Shared secure-outbound egress contract — executable oracle for the fix
// (criterion #2). These pass today; they encode the exact behaviour the fixed
// senders must inherit and act as the green plumbing baseline for the harness.
// ---------------------------------------------------------------------------
describe("shared secure-outbound egress contract (oracle for the fix)", () => {
  const secureFetch = (whitelist: typeof STRICT_WHITELIST) =>
    ((input: any, init: any) =>
      fetch(
        input,
        addSecureOutboundConnectionValidation(init ?? {}, {
          whitelist,
          logContext: "PostHog integration",
        }),
      )) as any;

  // O1 — the purest TOCTOU: a public-looking hostname whose connect-time
  // resolution returns a blocked IP is rejected by the connect-time lookup.
  it("connect-time lookup rejects a host that resolves to a blocked IP (rebind)", async () => {
    const rebindLookup = createSecureOutboundLookup(
      { whitelist: STRICT_WHITELIST, logContext: "PostHog integration" },
      // Base resolver: a public-looking name rebinds to loopback at connect.
      ((_hostname: string, _options: unknown, cb: any) =>
        cb(null, "127.0.0.1", 4)) as any,
    );

    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      rebindLookup("public-rebind.test", {}, (e) => resolve(e));
    });

    expect(err).not.toBeNull();
    expect(err?.message).toContain("Blocked IP address detected");
  });

  // O2 — Mixpanel-shaped path: a raw global fetch, once wrapped with the
  // shared connection validation, is blocked before egress.
  it("raw fetch (Mixpanel-shaped) to a loopback host is blocked before egress", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });

    await expect(
      fetch(
        nameUrl,
        addSecureOutboundConnectionValidation(
          {},
          { whitelist: STRICT_WHITELIST, logContext: "Mixpanel integration" },
        ),
      ),
    ).rejects.toMatchObject({
      message: "fetch failed",
      cause: expect.objectContaining({
        message: "Blocked IP address detected",
      }),
    });
    expect(requestCount).toBe(0);
  });

  // O3 — PostHog SDK path: real posthog-node with the wrapped fetch is blocked
  // before egress and surfaces the SSRF block on its cause chain.
  it("posthog-node with the wrapped fetch is blocked before egress", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });
    const client = new PostHog("phc_oracle", {
      host: nameUrl,
      flushAt: 1_000,
      maxQueueSize: 10_000,
      fetchRetryCount: 0,
      fetchRetryDelay: 0,
      fetch: secureFetch(STRICT_WHITELIST),
    });
    client.capture({ distinctId: "p", event: "e", properties: {} });

    let flushError: unknown;
    try {
      await client.flush();
    } catch (error) {
      flushError = error;
    }
    await client.shutdown().catch(() => {});

    expect(flushError).toBeDefined();
    expect(causeChainIncludes(flushError, "Blocked IP address detected")).toBe(
      true,
    );
    expect(requestCount).toBe(0);
  });

  // O4 — criterion #4: a legitimate host (modelled by whitelisting localhost)
  // still sends. Pinning must not regress normal delivery.
  it("a whitelisted (legitimate) host still sends successfully", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });
    const client = new PostHog("phc_oracle", {
      host: nameUrl,
      flushAt: 1_000,
      maxQueueSize: 10_000,
      fetchRetryCount: 0,
      fetchRetryDelay: 0,
      fetch: secureFetch({ hosts: ["localhost"], ips: [], ip_ranges: [] }),
    });
    client.capture({ distinctId: "p", event: "e", properties: {} });
    await client.flush();
    await client.shutdown().catch(() => {});

    expect(requestCount).toBeGreaterThan(0);
  });

  // O5 — redirect defense: the connect-time hook does NOT fire for IP literals
  // (verified: a direct fetch to a 127.0.0.1 literal reaches the server), so a
  // redirect to a private/link-local literal is only stopped by redirect-target
  // URL validation. The origin uses an IP literal so its own connect is not
  // pre-blocked, isolating the redirect check.
  it("redirect to a private IP literal is rejected by the redirect-target validator", async () => {
    // validateWebhookURL is neutralised at file scope for the handler suite;
    // use the REAL one here — it is the exact redirect validator the
    // integration uses.
    const { validateWebhookURL } = await vi.importActual<
      typeof import("@langfuse/shared/src/server")
    >("@langfuse/shared/src/server");

    const { literalUrl: origin } = await startLoopbackServer(
      () => undefined,
      (res) => {
        res.writeHead(302, { Location: "http://169.254.169.254/" });
        res.end();
      },
    );

    await expect(
      fetchWithSecureRedirects(
        origin,
        {},
        {
          maxRedirects: 5,
          redirectValidation: {
            validateUrl: validateWebhookURL,
            whitelist: STRICT_WHITELIST,
            logContext: "PostHog integration",
          },
        },
      ),
    ).rejects.toMatchObject({ name: "RedirectValidationError" });
  });
});

// ---------------------------------------------------------------------------
// Mixpanel sender — mirror of the PostHog fix-detector.
//
// Driven through the `baseUrl` seam (test-only override of the Mixpanel API
// origin; production still defaults to https://<region>.mixpanel.com). The
// send goes through the shared connect-time-pinned egress, so pointing it at a
// `localhost` NAME makes the connect-time lookup re-resolve to 127.0.0.1 and
// block — the same validate-public / connect-private rebind the PostHog
// detector models.
//
// NON-VACUITY: `requestCount === 0` only means something if the server would
// otherwise have been reached. Each test therefore first fires a bare global
// fetch at the exact URL the client targets — that IS the pre-fix Mixpanel
// path — and asserts it lands. So these tests would be RED against the
// pre-fix bare-`fetch` sender.
// ---------------------------------------------------------------------------
describe("Mixpanel sender — SSRF connect-time pinning", () => {
  const addOneEvent = (client: MixpanelClient) =>
    client.addEvent({
      event: "trace",
      properties: { token: "t", distinct_id: "1", $insert_id: 1 },
    } as unknown as MixpanelEvent);

  it("rejects a validated host that connects to a blocked IP, before egress and terminally", async () => {
    let requestCount = 0;
    const { nameUrl, port } = await startLoopbackServer(
      () => {
        requestCount++;
      },
      (res) => res.end("{}"),
    );

    // Negative control: the pre-fix path (bare global fetch) reaches the
    // server, so a later count of 0 proves the pinning blocked it rather than
    // the harness being unreachable.
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
    addOneEvent(client);

    let thrown: unknown;
    try {
      await client.flush();
    } catch (error) {
      thrown = error;
    }

    // Criterion #1: the pinned send never reached the socket — no new hits
    // beyond the control request above.
    expect(requestCount).toBe(1);
    // Criterion #3: terminal failure (BullMQ suppresses retries).
    expect(thrown).toBeDefined();
    expect(isUnrecoverableError(thrown)).toBe(true);
    // The terminal error must be caused BY the SSRF block. Without this, an
    // unrelated UnrecoverableError thrown before any send attempt would
    // satisfy both assertions above while pinning did nothing.
    expect(causeChainIncludes(thrown, "Blocked IP address detected")).toBe(
      true,
    );
  }, 40_000);

  // NOTE — two Mixpanel cases deliberately do NOT live in this file. Neither is
  // blocked by this file's mocks; both are placement decisions.
  //
  // 1. "an IP-literal destination is refused". It WOULD pass here (verified):
  //    the destination check is validateAnalyticsIntegrationUrl, which uses
  //    parseOutboundUrl / isIPAddress / validateOutboundResolvedIp and never
  //    touches the validateWebhookURL this file stubs. It lives in
  //    analyticsIntegrationOutboundUrlNegative.test.ts for cohesion: it is one
  //    of the mandated negative cases (loopback, IPv6 loopback, cloud metadata,
  //    RFC1918, private-resolving hostname, embedded credentials) and belongs
  //    with its siblings, under that file's self-enforced empty allowlist.
  //    Duplicating it here would double the maintenance for no extra signal.
  //
  // 2. The positive control (gzip body + dispatcher + response handling). An
  //    earlier version of this file asserted an IP literal DELIVERS, which was
  //    wrong — it only delivered because the connect-time DNS hook never fires
  //    for literals, so that test documented the hole as intended behaviour.
  //    The success path is now proven in
  //    analyticsIntegrationOutboundUrlAllowlist.test.ts by allowlisting a
  //    DNS-named host, which does not depend on the literal loophole.
  //
  // The file's stubbed validateWebhookURL IS still a real constraint, just not
  // on the two cases above: it is the REDIRECT-HOP validator the senders pass to
  // fetchWithSecureRedirects. So do not add a redirect-target assertion to this
  // file — it would be vacuous here. Those live in the negative suite and in O5
  // above, which reaches for the real validator explicitly.
});
