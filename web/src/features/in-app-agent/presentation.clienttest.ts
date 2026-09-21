import { parseInAppAgentDock } from "./presentation";

describe("parseInAppAgentDock", () => {
  it("defaults unknown values to the docked sidebar", () => {
    expect(parseInAppAgentDock("sidebar")).toBe("sidebar");
    expect(parseInAppAgentDock("detached")).toBe("detached");
    expect(parseInAppAgentDock("fullscreen")).toBe("sidebar");
    expect(parseInAppAgentDock(undefined)).toBe("sidebar");
  });
});
