// @vitest-environment node

import { describe, expect, it } from "vitest";

import { costFormatter } from "@/src/utils/numbers";

describe("costFormatter", () => {
  it("formats dashboard costs with cent precision", () => {
    expect(costFormatter(4.402973)).toBe("$4.40");
    expect(costFormatter(0.068415)).toBe("$0.07");
    expect(costFormatter(0.015427)).toBe("$0.02");
    expect(costFormatter(0)).toBe("$0.00");
  });
});
