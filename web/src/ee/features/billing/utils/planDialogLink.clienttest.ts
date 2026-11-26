import {
  planDialogHref,
  planDialogSourceFromQuery,
  withoutPlanDialogParams,
} from "@/src/ee/features/billing/utils/planDialogLink";

describe("plan dialog link", () => {
  it("builds a billing link that asks for the plan dialog", () => {
    expect(planDialogHref("org-1", "sidebar")).toBe(
      "/organization/org-1/settings/billing?plans=open&source=sidebar",
    );
  });

  it("reads the source of a link it built", () => {
    expect(planDialogSourceFromQuery({ plans: "open", source: "coupon" })).toBe(
      "coupon",
    );
  });

  it("treats an unknown or missing source as a plain link", () => {
    expect(planDialogSourceFromQuery({ plans: "open", source: "x" })).toBe(
      "link",
    );
    expect(planDialogSourceFromQuery({ plans: "open" })).toBe("link");
  });

  it("asks for nothing without the plans parameter", () => {
    expect(planDialogSourceFromQuery({ source: "sidebar" })).toBeNull();
    expect(planDialogSourceFromQuery({ plans: "closed" })).toBeNull();
  });

  it("drops only its own parameters from a query", () => {
    expect(
      withoutPlanDialogParams({
        organizationId: "org-1",
        plans: "open",
        source: "sidebar",
      }),
    ).toEqual({ organizationId: "org-1" });
  });
});
