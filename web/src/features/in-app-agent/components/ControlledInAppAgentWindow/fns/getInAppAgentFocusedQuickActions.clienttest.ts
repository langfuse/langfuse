import { getInAppAgentFocusedQuickActions } from "./getInAppAgentFocusedQuickActions";

describe("getInAppAgentFocusedQuickActions", () => {
  it("returns focused actions only for entity screen context types", () => {
    expect(getInAppAgentFocusedQuickActions("trace")).toBeDefined();
    expect(getInAppAgentFocusedQuickActions("trace-list")).toBeUndefined();
    expect(getInAppAgentFocusedQuickActions("page")).toBeUndefined();
  });
});
