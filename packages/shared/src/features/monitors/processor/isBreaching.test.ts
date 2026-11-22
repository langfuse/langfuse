import { describe, it, expect } from "vitest";

import { isBreaching } from "./processor";

describe("isBreaching", () => {
  it.each(["ALERT", "WARNING"] as const)(
    "treats %s as a breach (gets a data-window link)",
    (severity) => {
      expect(isBreaching(severity)).toBe(true);
    },
  );

  it.each(["OK", "NO_DATA", "UNKNOWN", "PAUSED"] as const)(
    "treats %s as a non-breach (no data-window link)",
    (severity) => {
      expect(isBreaching(severity)).toBe(false);
    },
  );
});
