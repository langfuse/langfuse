/** @jest-environment node */
import {
  getBillingCycleAnchor,
  getBillingCycleStart,
} from "@/src/ee/features/usage-thresholds/utils/billingCycleHelpers";
import { type Organization } from "@langfuse/shared";

describe("getBillingCycleAnchor", () => {
  it("returns billingCycleAnchor when set", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: new Date("2024-01-15T10:30:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    } as Organization;

    const result = getBillingCycleAnchor(org);

    expect(result).toEqual(new Date("2024-01-15T00:00:00Z")); // start of day
  });

  it("falls back to createdAt when billingCycleAnchor is null", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: null,
      createdAt: new Date("2024-01-01T10:30:00Z"),
    } as Organization;

    const result = getBillingCycleAnchor(org);

    expect(result).toEqual(new Date("2024-01-01T00:00:00Z")); // start of day
  });
});

describe("getBillingCycleStart", () => {
  it("handles anchor on 15th consistently across months", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    } as Organization;

    // March 15th reference → cycle starts March 15
    expect(getBillingCycleStart(org, new Date("2024-03-20T10:00:00Z"))).toEqual(
      new Date("2024-03-15T00:00:00Z"),
    );

    // February 10th reference → cycle starts January 15 (previous month)
    expect(getBillingCycleStart(org, new Date("2024-02-10T10:00:00Z"))).toEqual(
      new Date("2024-01-15T00:00:00Z"),
    );
  });

  it("handles anchor on 31st → adjusts to last day of month", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: new Date("2024-01-31T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    } as Organization;

    // February (29 days in 2024, leap year) - reference after cycle day → Feb 29
    expect(getBillingCycleStart(org, new Date("2024-03-05T10:00:00Z"))).toEqual(
      new Date("2024-02-29T00:00:00Z"),
    );

    // April (30 days) - reference after cycle day → April 30
    expect(getBillingCycleStart(org, new Date("2024-05-05T10:00:00Z"))).toEqual(
      new Date("2024-04-30T00:00:00Z"),
    );

    // March (31 days) - reference after cycle day → March 31
    expect(getBillingCycleStart(org, new Date("2024-04-05T10:00:00Z"))).toEqual(
      new Date("2024-03-31T00:00:00Z"),
    );
  });

  it("handles leap year February correctly", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: new Date("2024-01-31T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    } as Organization;

    // 2024 is leap year - reference after Feb 29 → Feb 29
    expect(getBillingCycleStart(org, new Date("2024-03-01T10:00:00Z"))).toEqual(
      new Date("2024-02-29T00:00:00Z"),
    );

    // 2025 is not leap year - reference after Feb 28 → Feb 28
    const org2025 = {
      ...org,
      billingCycleAnchor: new Date("2025-01-31T00:00:00Z"),
    } as Organization;

    expect(
      getBillingCycleStart(org2025, new Date("2025-03-01T10:00:00Z")),
    ).toEqual(new Date("2025-02-28T00:00:00Z"));
  });

  it("handles reference date before cycle start in current month", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: new Date("2024-01-15T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    } as Organization;

    // Feb 10 (before Feb 15) → goes back to Jan 15
    expect(getBillingCycleStart(org, new Date("2024-02-10T10:00:00Z"))).toEqual(
      new Date("2024-01-15T00:00:00Z"),
    );

    // Feb 15 exactly → stays at Feb 15
    expect(getBillingCycleStart(org, new Date("2024-02-15T00:00:00Z"))).toEqual(
      new Date("2024-02-15T00:00:00Z"),
    );

    // Feb 20 (after Feb 15) → stays at Feb 15
    expect(getBillingCycleStart(org, new Date("2024-02-20T10:00:00Z"))).toEqual(
      new Date("2024-02-15T00:00:00Z"),
    );
  });

  it("handles month boundaries with 31st anchor across year transition", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: new Date("2023-12-31T00:00:00Z"),
      createdAt: new Date("2023-12-01T00:00:00Z"),
    } as Organization;

    // Jan 2024 - reference after Jan 31 → Jan 31
    expect(getBillingCycleStart(org, new Date("2024-02-05T10:00:00Z"))).toEqual(
      new Date("2024-01-31T00:00:00Z"),
    );

    // Feb 2024 (leap year) - reference after Feb 29 → Feb 29
    expect(getBillingCycleStart(org, new Date("2024-03-01T10:00:00Z"))).toEqual(
      new Date("2024-02-29T00:00:00Z"),
    );
  });

  it("handles year crossover with December anchor", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: new Date("2023-12-15T00:00:00Z"),
      createdAt: new Date("2023-12-01T00:00:00Z"),
    } as Organization;

    // Jan 10 (before Jan 15) → goes back to Dec 15 previous year
    expect(getBillingCycleStart(org, new Date("2024-01-10T10:00:00Z"))).toEqual(
      new Date("2023-12-15T00:00:00Z"),
    );

    // Jan 15 exactly → Jan 15 current year
    expect(getBillingCycleStart(org, new Date("2024-01-15T00:00:00Z"))).toEqual(
      new Date("2024-01-15T00:00:00Z"),
    );

    // Jan 20 (after Jan 15) → Jan 15 current year
    expect(getBillingCycleStart(org, new Date("2024-01-20T10:00:00Z"))).toEqual(
      new Date("2024-01-15T00:00:00Z"),
    );
  });

  it("uses createdAt as fallback when billingCycleAnchor is null", () => {
    const org = {
      id: "org-1",
      billingCycleAnchor: null,
      createdAt: new Date("2024-01-15T10:30:00Z"),
    } as Organization;

    expect(getBillingCycleStart(org, new Date("2024-02-20T10:00:00Z"))).toEqual(
      new Date("2024-02-15T00:00:00Z"),
    );
  });
});
