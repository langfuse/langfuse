import { ObservationType } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  formatObservationCost,
  isObservationCostDisplayable,
  MISSING_OBSERVATION_COST_PLACEHOLDER,
} from "@/src/utils/observationCost";

describe("formatObservationCost", () => {
  it("shows a formatted amount for an explicit zero on generations", () => {
    expect(formatObservationCost(0, ObservationType.GENERATION)).toBe("$0.00");
    expect(isObservationCostDisplayable(0, ObservationType.GENERATION)).toBe(
      true,
    );
  });

  it("shows a dash when cost is missing on a generation", () => {
    expect(formatObservationCost(null, ObservationType.GENERATION)).toBe(
      MISSING_OBSERVATION_COST_PLACEHOLDER,
    );
    expect(formatObservationCost(undefined, ObservationType.GENERATION)).toBe(
      MISSING_OBSERVATION_COST_PLACEHOLDER,
    );
  });

  it("shows a dash for non-generation types even when a numeric cost is present", () => {
    expect(formatObservationCost(0, ObservationType.SPAN)).toBe(
      MISSING_OBSERVATION_COST_PLACEHOLDER,
    );
    expect(formatObservationCost(0.12, ObservationType.AGENT)).toBe(
      MISSING_OBSERVATION_COST_PLACEHOLDER,
    );
    expect(formatObservationCost(0.12, undefined)).toBe(
      MISSING_OBSERVATION_COST_PLACEHOLDER,
    );
  });

  it("formats a positive generation cost", () => {
    expect(formatObservationCost(0.0045, ObservationType.GENERATION)).toBe(
      "$0.0045",
    );
  });
});
