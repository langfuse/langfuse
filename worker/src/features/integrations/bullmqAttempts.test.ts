import { describe, it, expect } from "vitest";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { isFinalBullmqAttempt } from "./bullmqAttempts";

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

  it("treats an UnrecoverableError as an exhausted budget at attemptsMade 0", () => {
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
