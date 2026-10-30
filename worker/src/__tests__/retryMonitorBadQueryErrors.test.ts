import { describe, expect, it } from "vitest";

import { __test } from "../scripts/retryMonitorBadQueryErrors";

const { parseArgs } = __test;

describe("retryMonitorBadQueryErrors parseArgs", () => {
  it("defaults to a dry run so an accidental invocation never mutates", () => {
    expect(parseArgs([])).toEqual({ apply: false, jitterMinutes: 15 });
  });

  it("enables the update only when --apply is present", () => {
    expect(parseArgs(["--apply"]).apply).toBe(true);
  });

  it("reads a custom --jitter-minutes", () => {
    expect(parseArgs(["--jitter-minutes=15"]).jitterMinutes).toBe(15);
  });

  it("allows a zero jitter for a big-bang reactivation", () => {
    expect(parseArgs(["--jitter-minutes=0"]).jitterMinutes).toBe(0);
  });

  it("falls back to the default on a negative or non-numeric jitter", () => {
    expect(parseArgs(["--jitter-minutes=-5"]).jitterMinutes).toBe(15);
    expect(parseArgs(["--jitter-minutes=abc"]).jitterMinutes).toBe(15);
  });
});
