import {
  getInAppAgentFocusedQuickActions,
  getInAppAgentQuickActionContext,
} from "./quickActions";

describe("contextual assistant quick actions", () => {
  it("classifies project sections and falls back to observability", () => {
    expect(getInAppAgentQuickActionContext("/project/p-1/datasets/d-1")).toBe(
      "evaluation",
    );
    expect(
      getInAppAgentQuickActionContext("/project/p-1/unsupported-feature"),
    ).toBe("observability");
    expect(getInAppAgentQuickActionContext("/organization/o-1/settings")).toBe(
      "observability",
    );
  });

  it("returns focused actions only for entity screen context types", () => {
    expect(getInAppAgentFocusedQuickActions("trace")).toBeDefined();
    expect(getInAppAgentFocusedQuickActions("trace-list")).toBeUndefined();
    expect(getInAppAgentFocusedQuickActions("page")).toBeUndefined();
  });
});
