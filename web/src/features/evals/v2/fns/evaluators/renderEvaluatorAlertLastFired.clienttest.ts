// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderEvaluatorAlertLastFired } from "./renderEvaluatorAlertLastFired";

describe("renderEvaluatorAlertLastFired", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("renders the relative time of the latest alert emission", () => {
    expect(
      renderEvaluatorAlertLastFired(new Date("2026-06-01T12:00:00.000Z")),
    ).toBe("Last fired 2 days ago");
  });

  it("renders alerts that have not fired", () => {
    expect(renderEvaluatorAlertLastFired(null)).toBe("Never fired");
  });
});
