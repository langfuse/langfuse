import { ObservationType } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import {
  formatObservationTokenCount,
  isObservationTokenCountDisplayable,
  MISSING_OBSERVATION_TOKEN_COUNT_PLACEHOLDER,
} from "@/src/utils/observationTokenCount";

describe("formatObservationTokenCount", () => {
  it("shows an explicit zero on generations and embeddings", () => {
    expect(formatObservationTokenCount(0, ObservationType.GENERATION)).toBe(
      "0",
    );
    expect(formatObservationTokenCount(0, ObservationType.EMBEDDING)).toBe("0");
    expect(
      isObservationTokenCountDisplayable(0, ObservationType.GENERATION),
    ).toBe(true);
  });

  it("shows a dash for zero on types that do not report token counts", () => {
    for (const type of [
      ObservationType.SPAN,
      ObservationType.EVENT,
      ObservationType.AGENT,
      ObservationType.TOOL,
      ObservationType.CHAIN,
      ObservationType.RETRIEVER,
      ObservationType.EVALUATOR,
      ObservationType.GUARDRAIL,
    ]) {
      expect(formatObservationTokenCount(0, type)).toBe(
        MISSING_OBSERVATION_TOKEN_COUNT_PLACEHOLDER,
      );
    }
  });

  it("shows a persisted non-zero count on every type", () => {
    expect(formatObservationTokenCount(12, ObservationType.SPAN)).toBe("12");
    expect(formatObservationTokenCount(1500, ObservationType.AGENT)).toBe(
      "1,500",
    );
    expect(formatObservationTokenCount(42, ObservationType.GENERATION)).toBe(
      "42",
    );
  });

  it("shows a dash when the count is missing", () => {
    expect(formatObservationTokenCount(null, ObservationType.GENERATION)).toBe(
      MISSING_OBSERVATION_TOKEN_COUNT_PLACEHOLDER,
    );
    expect(formatObservationTokenCount(undefined, ObservationType.SPAN)).toBe(
      MISSING_OBSERVATION_TOKEN_COUNT_PLACEHOLDER,
    );
  });

  it("keeps an explicit zero when the observation type is missing", () => {
    expect(formatObservationTokenCount(0, undefined)).toBe("0");
    expect(formatObservationTokenCount(0, null)).toBe("0");
  });
});
