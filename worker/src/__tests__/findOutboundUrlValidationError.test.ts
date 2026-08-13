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
import {
  describeOutboundFailure,
  findOutboundUrlValidationError,
  isRedirectChainFailure,
  unvalidatedRedirectTarget,
} from "../errors/findOutboundUrlValidationError";

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

// A redirect budget/loop fault and an IP-policy block are both permanent, so
// the terminal/retryable split above cannot tell them apart. They must still be
// REPORTED differently: operators alert on SSRF signals, and a merely
// misconfigured (over-long or looping) redirect chain must not fire that alert.
//
// These assert the predicate rather than the wording, so they keep protecting
// the property if the operator-facing text is reworded.
describe("outbound-URL failure classification — chain faults vs SSRF blocks", () => {
  it("labels redirect budget and loop faults as chain faults", () => {
    expect(
      isRedirectChainFailure(
        new MaxRedirectsExceededError(10, ["http://a/", "http://b/"]),
      ),
    ).toBe(true);
    expect(
      isRedirectChainFailure(
        new CircularRedirectError(["http://a/", "http://b/", "http://a/"]),
      ),
    ).toBe(true);
  });

  it("does not label a redirect into a blocked target as a chain fault", () => {
    // The chain itself was fine — it pointed somewhere forbidden. This one must
    // keep the SSRF wording.
    const redirectIntoBlocked = new RedirectValidationError(
      "Blocked IP address detected",
      "http://169.254.169.254/",
      0,
    );
    expect(isRedirectChainFailure(redirectIntoBlocked)).toBe(false);
  });

  it("does not label a direct IP-policy block as a chain fault", () => {
    expect(isRedirectChainFailure(ipBlock())).toBe(false);
  });

  // Both kinds are permanent; the labelling split must not have made either
  // retryable.
  it("keeps chain faults and SSRF blocks alike terminal", () => {
    for (const error of [
      new MaxRedirectsExceededError(10, ["http://a/"]),
      new CircularRedirectError(["http://a/", "http://a/"]),
      new RedirectValidationError(
        "Blocked IP address detected",
        "http://x/",
        0,
      ),
      ipBlock(),
    ]) {
      expect(classifiesTerminal(error)).toBe(true);
    }
  });
});

// The DETECTION half of the same fix. Suppressing the SSRF wording for a chain
// fault is only safe if the operator is still told WHERE the chain stopped —
// otherwise "too many hops" and "something aimed my exporter at the metadata
// service" become indistinguishable, which is the outcome the wording change
// exists to prevent. Nothing else asserts the target is named, so a refactor
// could drop the suffix and every other test here would still pass.
describe("outbound-URL failure description", () => {
  const METADATA = "http://169.254.169.254/latest/meta-data/iam/";

  it.each([
    [
      "budget exhaustion",
      () =>
        new MaxRedirectsExceededError(10, ["https://ph.example/a", METADATA]),
    ],
    [
      "a redirect loop",
      () => new CircularRedirectError(["https://a.example/", METADATA]),
    ],
  ])("names the unvalidated final target for %s", (_label, makeError) => {
    const description = describeOutboundFailure(makeError());

    expect(description).toContain(METADATA);
    // Still must not claim a verdict it cannot support.
    expect(description).not.toContain("SSRF");
  });

  it("reports the stop without a target when the chain is unavailable", () => {
    // An empty chain must degrade to the plain sentence — never print the string
    // "undefined" at an operator, which is the classic template-interpolation
    // tell and reads as a bug in the exporter rather than in the configuration.
    for (const error of [
      new MaxRedirectsExceededError(10, []),
      new CircularRedirectError([]),
    ]) {
      const description = describeOutboundFailure(error);

      expect(description).toContain("redirect chain stopped");
      expect(description).not.toContain("undefined");
      expect(description).not.toContain("SSRF");
    }
  });

  it("does not name a target for a policy block", () => {
    // A policy block already identifies its own target through the validation
    // error; the chain-stop wording would misdescribe it.
    for (const error of [
      ipBlock(),
      new RedirectValidationError("Blocked IP address detected", METADATA, 2),
    ]) {
      expect(describeOutboundFailure(error)).toBe(
        "blocked by outbound SSRF protection",
      );
    }
  });

  it("extracts the final target only from redirect-chain errors", () => {
    expect(
      unvalidatedRedirectTarget(
        new MaxRedirectsExceededError(10, ["https://a/", METADATA]),
      ),
    ).toBe(METADATA);
    expect(unvalidatedRedirectTarget(ipBlock())).toBeUndefined();
    expect(
      unvalidatedRedirectTarget(new MaxRedirectsExceededError(10, [])),
    ).toBeUndefined();
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
