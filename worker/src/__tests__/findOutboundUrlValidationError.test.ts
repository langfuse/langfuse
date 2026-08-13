/**
 * Classification contract for outbound-URL failures on the analytics export
 * path: which failures are PERMANENT (fail the job terminally, no retry) and
 * which are TRANSIENT (let BullMQ retry).
 *
 * Why this matters: a permanent SSRF block must not be retried 4x on every
 * scheduled export, and — the direction that is easy to get wrong — a transient
 * resolver blip must NOT be mistaken for a permanent block, or one DNS hiccup
 * permanently kills a tenant's export run.
 *
 * These tests pin the BEHAVIOUR (terminal vs retryable) rather than the
 * mechanism. The classifier currently recognises the redirect-wrapped DNS case
 * by a message marker, because RedirectValidationError preserves neither `code`
 * nor `cause` — if that wording drifts, the carve-out silently stops working
 * and `staysRetryable` below is what catches it.
 */
import { describe, expect, it } from "vitest";
import {
  CircularRedirectError,
  MaxRedirectsExceededError,
  OutboundUrlValidationError,
  RedirectValidationError,
} from "@langfuse/shared/src/server";
import { findOutboundUrlValidationError } from "../errors/findOutboundUrlValidationError";

/** The job fails terminally: the classifier recognises a permanent fault. */
const classifiesTerminal = (error: unknown) =>
  findOutboundUrlValidationError(error) !== undefined;

/** BullMQ keeps retrying: the classifier declines to mark it permanent. */
const staysRetryable = (error: unknown) =>
  findOutboundUrlValidationError(error) === undefined;

/** How undici surfaces a connect-time lookup rejection. */
const undiciWrapped = (cause: unknown) =>
  new TypeError("fetch failed", { cause });

/** How an SDK (posthog-node) wraps the undici failure again. */
const sdkWrapped = (cause: unknown) =>
  new Error("Network error while fetching PostHog", { cause });

const ipBlock = () =>
  new OutboundUrlValidationError("blocked-ip", "Blocked IP address detected");

const dnsFailure = () =>
  new OutboundUrlValidationError(
    "dns-lookup-failed",
    "DNS lookup failed for app.posthog.example",
  );

describe("outbound-URL failure classification — permanent faults", () => {
  // Load-bearing: this is the whole point of the terminal path. The block is
  // raised deep inside undici's connect hook and re-wrapped twice before the
  // handler sees it, so a shallow check would miss it and retry an SSRF block.
  it("treats an IP-policy block as terminal through undici + SDK wrapping", () => {
    expect(classifiesTerminal(ipBlock())).toBe(true);
    expect(classifiesTerminal(undiciWrapped(ipBlock()))).toBe(true);
    expect(classifiesTerminal(sdkWrapped(undiciWrapped(ipBlock())))).toBe(true);
  });

  it("returns the underlying validation error so callers can report the cause", () => {
    const block = ipBlock();
    expect(
      findOutboundUrlValidationError(sdkWrapped(undiciWrapped(block))),
    ).toBe(block);
  });

  // A redirect into a blocked target is a permanent misconfiguration, and
  // RedirectValidationError drops `code`/`cause`, so it can only be recognised
  // from what it preserves.
  it("treats a redirect into a blocked target as terminal", () => {
    const redirectBlock = new RedirectValidationError(
      "Blocked IP address detected",
      "http://169.254.169.254/",
      0,
    );
    expect(classifiesTerminal(redirectBlock)).toBe(true);
  });

  // Redirect-chain abuse cannot be fixed by retrying.
  it("treats redirect-chain exhaustion and loops as terminal", () => {
    expect(
      classifiesTerminal(
        new MaxRedirectsExceededError(3, ["http://a/", "http://b/"]),
      ),
    ).toBe(true);
    expect(
      classifiesTerminal(
        new CircularRedirectError(["http://a/", "http://b/", "http://a/"]),
      ),
    ).toBe(true);
  });
});

describe("outbound-URL failure classification — transient faults stay retryable", () => {
  // THE REGRESSION GUARD. A resolver blip is not an SSRF block. If this flips,
  // one transient DNS failure permanently disables a tenant's export instead of
  // being retried.
  it("keeps a bare DNS-resolution failure retryable", () => {
    expect(staysRetryable(dnsFailure())).toBe(true);
  });

  it("keeps a DNS-resolution failure retryable through undici wrapping", () => {
    expect(staysRetryable(undiciWrapped(dnsFailure()))).toBe(true);
    expect(staysRetryable(sdkWrapped(undiciWrapped(dnsFailure())))).toBe(true);
  });

  // The redirect path re-wraps into a message-only error, so this is the case
  // most likely to regress if the marker wording drifts.
  it("keeps a redirect-wrapped DNS-resolution failure retryable", () => {
    const redirectDns = new RedirectValidationError(
      "DNS lookup failed for app.posthog.example",
      "https://app.posthog.example/",
      0,
    );
    expect(staysRetryable(redirectDns)).toBe(true);
  });
});

describe("outbound-URL failure classification — unrelated failures", () => {
  it("does not claim unrelated errors", () => {
    expect(staysRetryable(new Error("shutdown delivery failed"))).toBe(true);
    expect(staysRetryable(undefined)).toBe(true);
    expect(staysRetryable(null)).toBe(true);
    expect(staysRetryable("a string rejection")).toBe(true);
  });

  // A cause cycle must not spin the worker. The explicit timeout makes a hang
  // fail the test rather than stall the suite.
  it("terminates on a self-referencing cause chain", () => {
    const cyclic: Error & { cause?: unknown } = new Error("cyclic");
    cyclic.cause = cyclic;
    expect(staysRetryable(cyclic)).toBe(true);

    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;
    expect(staysRetryable(a)).toBe(true);
  }, 5_000);

  // A cause cycle must not hide a real block sitting before the loop.
  it("still finds a block that precedes a cause cycle", () => {
    const block = ipBlock();
    const cyclic: Error & { cause?: unknown } = new Error("wrapper", {
      cause: block,
    });
    (block as Error & { cause?: unknown }).cause = cyclic;
    expect(classifiesTerminal(cyclic)).toBe(true);
  }, 5_000);
});
