import { describe, expect, it } from "vitest";
import { getGenerationLikeTypes, ObservationType } from "@langfuse/shared";

import { getDefaultObservationTypeFilter } from "./observationsDefaultTypeFilter";

describe("getDefaultObservationTypeFilter", () => {
  it("keeps the normal observations table scoped to generation-like types", () => {
    expect(getDefaultObservationTypeFilter({ hasPromptFilter: false })).toEqual(
      getGenerationLikeTypes(),
    );
  });

  it("includes SPAN for prompt-linked tables so OTEL prompt spans are visible", () => {
    expect(getDefaultObservationTypeFilter({ hasPromptFilter: true })).toEqual([
      ...getGenerationLikeTypes(),
      ObservationType.SPAN,
    ]);
  });
});
