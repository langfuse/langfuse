/**
 * How the analytics exporters REPORT a broken redirect chain.
 *
 * A redirect budget/loop fault and a redirect into a blocked target are both
 * permanent, so terminal-vs-retryable classification cannot tell them apart.
 * They must still be reported differently: operators alert on SSRF signals, and
 * a merely over-long or looping redirect chain is a benign misconfiguration that
 * must not trip that alert.
 *
 * The transport is mocked so the chain faults can be injected — the sender's own
 * error mapping is what is under test. That premise is the opposite of
 * analyticsIntegrationRedirectBudget.test.ts, which needs the real redirect
 * engine, hence two files: mixing them let a `vi.importActual` of the barrel
 * leak across tests and silently break the mapping assertions.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

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

// Only the transport is replaced, so the sender's real mapping runs.
const transport = vi.hoisted(() => ({
  fetchWithSecureRedirects: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    fetchWithSecureRedirects: transport.fetchWithSecureRedirects,
  };
});

import {
  CircularRedirectError,
  MaxRedirectsExceededError,
  RedirectValidationError,
} from "@langfuse/shared/src/server";
import { MixpanelClient } from "../features/mixpanel/mixpanelClient";
import type { MixpanelEvent } from "../features/mixpanel/transformers";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

afterEach(() => {
  transport.fetchWithSecureRedirects.mockReset();
});

/** A destination an operator must be able to spot in the failure text. */
const METADATA = "http://169.254.169.254/latest/meta-data/iam/";

/** Runs one export batch and returns the failure it surfaced. */
const failureFromOneBatch = async (): Promise<unknown> => {
  const client = new MixpanelClient({
    projectToken: "t",
    region: "api",
    // A DNS name: the destination pre-check passes names through (they are
    // policed at connect time instead), so the run reaches the mocked transport
    // where the injected fault surfaces. No allowlist needed.
    baseUrl: "http://export-target.test",
  });
  client.addEvent({
    event: "trace",
    properties: { token: "t", distinct_id: "1", $insert_id: 1 },
  } as unknown as MixpanelEvent);

  try {
    await client.flush();
    return undefined;
  } catch (error) {
    return error;
  }
};

describe("analytics export redirect-chain fault reporting", () => {
  it.each([
    [
      "budget exhaustion",
      () => new MaxRedirectsExceededError(10, ["http://a/", METADATA]),
    ],
    [
      // Loops back to a target it already visited, so the chain both repeats and
      // ends on the target the operator needs to see.
      "a redirect loop",
      () => new CircularRedirectError([METADATA, "http://a/", METADATA]),
    ],
  ])(
    "reports %s without raising an SSRF signal, naming where the chain stopped",
    async (_label, makeError) => {
      transport.fetchWithSecureRedirects.mockRejectedValue(makeError());

      const failure = await failureFromOneBatch();

      expect(failure).toBeDefined();
      // Still permanent — the labelling split must not have made it retryable.
      expect(isUnrecoverableError(failure)).toBe(true);
      expect(String((failure as Error).message)).not.toContain("SSRF");
      // Suppressing the SSRF signal is only safe if the operator can still see
      // WHERE the chain stopped. Asserted on the sender's own message, not just
      // on describeOutboundFailure, so a refactor that stops routing through it
      // is caught here rather than passing on unit coverage alone.
      expect(String((failure as Error).message)).toContain(METADATA);
    },
    30_000,
  );

  // The counterpart: the chain was fine, it pointed somewhere forbidden. This
  // one must keep the SSRF wording, otherwise the labelling split has simply
  // suppressed the signal everywhere. Together with the cases above this pins
  // the distinction from both sides.
  it("reports a redirect into a blocked target as an SSRF block", async () => {
    transport.fetchWithSecureRedirects.mockRejectedValue(
      new RedirectValidationError(
        "Blocked IP address detected",
        "http://169.254.169.254/",
        0,
      ),
    );

    const failure = await failureFromOneBatch();

    expect(failure).toBeDefined();
    expect(isUnrecoverableError(failure)).toBe(true);
    expect(String((failure as Error).message)).toContain("SSRF");
  }, 30_000);

  // An unrelated transport failure must stay retryable: it is neither a chain
  // fault nor an SSRF block, and marking it permanent would drop a batch that a
  // retry would have delivered.
  it("leaves an unrelated transport failure retryable", async () => {
    transport.fetchWithSecureRedirects.mockRejectedValue(
      new Error("socket hang up"),
    );

    const failure = await failureFromOneBatch();

    expect(failure).toBeDefined();
    expect(isUnrecoverableError(failure)).toBe(false);
  }, 30_000);
});
