import { ObservationType } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  formatObservationCost,
  isObservationCostDisplayable,
  isObservationCostSupported,
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

  it("shows a dash for spans and events when cost is missing", () => {
    expect(formatObservationCost(null, ObservationType.SPAN)).toBe(
      MISSING_OBSERVATION_COST_PLACEHOLDER,
    );
    expect(formatObservationCost(undefined, ObservationType.EVENT)).toBe(
      MISSING_OBSERVATION_COST_PLACEHOLDER,
    );
  });

  it("does not hide a persisted cost on generation-like types", () => {
    expect(isObservationCostSupported(ObservationType.EMBEDDING)).toBe(true);
    expect(isObservationCostSupported(ObservationType.AGENT)).toBe(true);
    expect(formatObservationCost(0.12, ObservationType.AGENT)).toBe("$0.12");
    expect(formatObservationCost(0.0003, ObservationType.EMBEDDING)).toBe(
      "$0.0003",
    );
  });

  it("does not hide a persisted cost on span or event rows", () => {
    expect(formatObservationCost(0.12, ObservationType.SPAN)).toBe("$0.12");
    expect(formatObservationCost(0, ObservationType.EVENT)).toBe("$0.00");
  });

  it("formats a persisted cost when type is missing", () => {
    expect(formatObservationCost(0.12, undefined)).toBe("$0.12");
  });

  it("formats a positive generation cost", () => {
    expect(formatObservationCost(0.0045, ObservationType.GENERATION)).toBe(
      "$0.0045",
    );
  });
});
