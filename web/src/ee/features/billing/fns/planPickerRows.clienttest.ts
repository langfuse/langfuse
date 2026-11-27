import { describe, expect, it } from "vitest";

import { planPickerRows } from "./planPickerRows";

const summary = (rows: ReturnType<typeof planPickerRows>) =>
  rows.map((row) => [row.name, row.price, row.note]);

describe("planPickerRows", () => {
  it("lists Hobby for a free organization, without price differences", () => {
    expect(
      summary(
        planPickerRows("cloud:hobby", {
          pending: null,
          periodEnd: null,
          trialPlanName: null,
        }),
      ),
    ).toEqual([
      ["Hobby", "Free", null],
      ["Core", "$29 / month", null],
      ["Pro", "$199 / month", null],
      ["Pro + Teams Add-on", "$499 / month", null],
      ["Enterprise", "$2,499 / month", null],
    ]);
  });

  it("leaves Hobby out for a paying organization and shows the difference to its plan", () => {
    const rows = planPickerRows("cloud:pro", {
      pending: null,
      periodEnd: "Dec 26",
      trialPlanName: null,
    });
    expect(summary(rows)).toEqual([
      ["Core", "$29 / month", "−$170 / month"],
      ["Pro", "$199 / month", "Renews Dec 26"],
      ["Pro + Teams Add-on", "$499 / month", "+$300 / month"],
      ["Enterprise", "$2,499 / month", "+$2,300 / month"],
    ]);
    expect(rows.filter((row) => row.isCurrent).map((row) => row.name)).toEqual([
      "Pro",
    ]);
  });

  it("marks no row as the current plan during a trial", () => {
    const rows = planPickerRows("cloud:hobby", {
      pending: null,
      periodEnd: null,
      trialPlanName: "Enterprise Trial",
    });
    expect(rows.some((row) => row.isCurrent)).toBe(false);
  });

  it("says when a scheduled switch starts on its target", () => {
    const rows = planPickerRows("cloud:pro", {
      pending: { kind: "switch", to: "cloud:core" },
      periodEnd: "Dec 26",
      trialPlanName: null,
    });
    expect(rows[0]).toMatchObject({
      name: "Core",
      note: "Starts Dec 26",
      isNoteADate: true,
      isNoteAWarning: true,
    });
    expect(rows[1]).toMatchObject({
      name: "Pro",
      note: "Ends Dec 26",
      isNoteADate: true,
      isNoteAWarning: true,
    });
  });
});
