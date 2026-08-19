import { describe, it, expect } from "vitest";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { isFinalBullmqAttempt } from "./bullmqAttempts";

// Sole owner of the "is this the last BullMQ attempt" decision. Blob storage's
// handler computed this inline as
//   (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1) - 1
// which fails OPEN on a missing opts.attempts (falls back to `1`, i.e. treats
// attempt 0 as already final). This module is the fixed, shared replacement:
// an unknown/missing attempts budget must fail CLOSED (never final), because a
// disable-on-fault handler gated on "final attempt" would otherwise disable an
// integration on its very first try whenever the caller forgot to pass
// `job.opts`.
//
// Mixpanel's own BullMQ jobs are never dispatched with an UnrecoverableError
// in practice (its region is a fixed enum, not a customer-supplied host, so
// there is no unreachable-host path that raises one) — but blob storage and
// PostHog jobs do reach outbound-URL validation failures that raise one, and
// this predicate is shared by all three, so the UnrecoverableError branch is
// pinned here even though no Mixpanel fixture will ever exercise it.

describe("isFinalBullmqAttempt", () => {
  it("is false before the last attempt of a known budget", () => {
    expect(
      isFinalBullmqAttempt({ attemptsMade: 0, opts: { attempts: 5 } }),
    ).toBe(false);
    expect(
      isFinalBullmqAttempt({ attemptsMade: 3, opts: { attempts: 5 } }),
    ).toBe(false);
  });

  it("is true on the last attempt of a known budget (attemptsMade is 0-based)", () => {
    expect(
      isFinalBullmqAttempt({ attemptsMade: 4, opts: { attempts: 5 } }),
    ).toBe(true);
  });

  it("is true past the budget, defensively", () => {
    expect(
      isFinalBullmqAttempt({ attemptsMade: 10, opts: { attempts: 5 } }),
    ).toBe(true);
  });

  // The fail-closed decision this module exists to pin. A job shaped exactly
  // like the pre-fix mixpanelIntegrationProjectJob.test.ts `makeJob()` fixture
  // (no `opts` at all) must never be treated as the final attempt — the
  // opposite of blob's old `?? 1` fallback, which made a missing budget look
  // exhausted on attempt zero.
  it("fails closed (never final) when opts is entirely absent", () => {
    expect(isFinalBullmqAttempt({ attemptsMade: 0 })).toBe(false);
    expect(isFinalBullmqAttempt({ attemptsMade: 0, opts: {} })).toBe(false);
  });

  it("fails closed (never final) when opts.attempts is undefined", () => {
    expect(
      isFinalBullmqAttempt({
        attemptsMade: 0,
        opts: { attempts: undefined },
      }),
    ).toBe(false);
  });

  // Named to flag: Mixpanel never builds this fixture in practice (see file
  // header) — this exists solely because blob/PostHog can reach it.
  it("treats an UnrecoverableError as an exhausted budget at attemptsMade 0 (unreachable-for-Mixpanel path, required for blob/PostHog)", () => {
    const error = new UnrecoverableError("blocked by SSRF protection");
    expect(
      isFinalBullmqAttempt({ attemptsMade: 0, opts: { attempts: 5 } }, error),
    ).toBe(true);
  });

  it("duck-types UnrecoverableError by .name, not instanceof", () => {
    const lookalike = { name: "UnrecoverableError", message: "blocked" };
    expect(
      isFinalBullmqAttempt(
        { attemptsMade: 0, opts: { attempts: 5 } },
        lookalike,
      ),
    ).toBe(true);
  });

  it("does not treat an ordinary Error as terminal on its own", () => {
    expect(
      isFinalBullmqAttempt(
        { attemptsMade: 0, opts: { attempts: 5 } },
        new Error("transient"),
      ),
    ).toBe(false);
  });
});
