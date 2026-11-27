import { describe, expect, it } from "vitest";

import {
  CANCELLATION_NOTE_MAX_LENGTH,
  CancellationFeedbackSchema,
  cancellationReasonIds,
  toStripeCancellationDetails,
} from "./cancellationReasons";

describe("toStripeCancellationDetails", () => {
  it("maps every reason to a feedback value Stripe accepts", () => {
    expect(
      Object.fromEntries(
        cancellationReasonIds.map((reason) => [
          reason,
          toStripeCancellationDetails({ reason }).feedback,
        ]),
      ),
    ).toEqual({
      too_expensive: "too_expensive",
      surprise_bill: "too_expensive",
      not_using: "unused",
      missing_feature: "missing_features",
      switching_tool: "switched_service",
      self_hosting: "switched_service",
      other: "other",
    });
  });

  it("keeps our reason id in the comment, before the trimmed note", () => {
    expect(
      toStripeCancellationDetails({ reason: "self_hosting", note: "  ops  " }),
    ).toEqual({ feedback: "switched_service", comment: "[self_hosting] ops" });
    expect(
      toStripeCancellationDetails({ reason: "surprise_bill", note: "   " }),
    ).toEqual({ feedback: "too_expensive", comment: "[surprise_bill]" });
  });
});

describe("CancellationFeedbackSchema", () => {
  it("rejects an unknown reason and a note over the limit", () => {
    expect(
      CancellationFeedbackSchema.safeParse({ reason: "bored" }).success,
    ).toBe(false);
    expect(
      CancellationFeedbackSchema.safeParse({
        reason: "other",
        note: "x".repeat(CANCELLATION_NOTE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
