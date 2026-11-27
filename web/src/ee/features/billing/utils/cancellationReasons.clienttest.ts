import { describe, expect, it } from "vitest";

import {
  CANCELLATION_NOTE_MAX_LENGTH,
  CancellationFeedbackSchema,
  cancellationReasonIds,
  nextStepForReason,
  noCancellationReasonPicks,
  orderReasonsForUser,
  stepAfterReason,
  toStripeCancellationDetails,
  withCancellationReasonPick,
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

describe("orderReasonsForUser", () => {
  const order = (userId: string) =>
    orderReasonsForUser(userId).map((reason) => reason.id);

  it("shows one person the same order every time, with every reason once", () => {
    expect(order("user-a")).toEqual(order("user-a"));
    expect([...order("user-a")].sort()).toEqual(
      [...cancellationReasonIds].sort(),
    );
  });

  it("keeps Something else last for everyone", () => {
    const userIds = Array.from({ length: 50 }, (_, index) => `user-${index}`);
    expect(userIds.every((userId) => order(userId).at(-1) === "other")).toBe(
      true,
    );
  });

  it("shows different people different orders", () => {
    const userIds = Array.from({ length: 50 }, (_, index) => `user-${index}`);
    const distinct = new Set(userIds.map((userId) => order(userId).join(",")));
    expect(distinct.size).toBeGreaterThan(20);
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

describe("cancel flow steps", () => {
  const on = { isNextStepEnabled: true };
  const off = { isNextStepEnabled: false };

  it("offers a next step for a reason that has one", () => {
    expect(nextStepForReason("surprise_bill", on)).toBe("spend_alert");
    expect(stepAfterReason("surprise_bill", on)).toBe("next_step");
  });

  it("goes straight to the confirm for a reason without a next step", () => {
    expect(stepAfterReason("other", on)).toBe("confirm");
  });

  it("skips the next step for every reason when it is switched off", () => {
    expect(
      cancellationReasonIds.map((reason) => stepAfterReason(reason, off)),
    ).toEqual(cancellationReasonIds.map(() => "confirm"));
  });
});

describe("withCancellationReasonPick", () => {
  it("keeps the first pick and counts no change for one pick", () => {
    expect(
      withCancellationReasonPick(noCancellationReasonPicks, "too_expensive"),
    ).toEqual({
      firstReason: "too_expensive",
      lastReason: "too_expensive",
      reasonChangeCount: 0,
    });
  });

  it("counts each switch to a different reason and keeps the first one", () => {
    const picks = (["too_expensive", "not_using", "other"] as const).reduce(
      withCancellationReasonPick,
      noCancellationReasonPicks,
    );
    expect(picks).toEqual({
      firstReason: "too_expensive",
      lastReason: "other",
      reasonChangeCount: 2,
    });
  });

  it("does not count picking the same reason again", () => {
    const picks = (["not_using", "not_using"] as const).reduce(
      withCancellationReasonPick,
      noCancellationReasonPicks,
    );
    expect(picks.reasonChangeCount).toBe(0);
  });
});
