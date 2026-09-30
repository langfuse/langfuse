import {
  isUnmountedResizablePanelGroupError,
  withMountedPanel,
} from "@/src/components/ui/resizable-panel-imperative";
import type { PanelImperativeHandle } from "react-resizable-panels";

function panelStub(
  overrides: Partial<PanelImperativeHandle> = {},
): PanelImperativeHandle {
  return {
    collapse: () => {},
    expand: () => {},
    getSize: () => ({ asPercentage: 30, inPixels: 280 }),
    isCollapsed: () => false,
    resize: () => {},
    ...overrides,
  };
}

describe("isUnmountedResizablePanelGroupError", () => {
  it("matches the library's group-lookup throws", () => {
    expect(
      isUnmountedResizablePanelGroupError(
        new Error(
          "Group resizable-layout-filter-layout-observations-events not found",
        ),
      ),
    ).toBe(true);
    expect(
      isUnmountedResizablePanelGroupError(
        new Error("Could not find data for Group with id _r_tt_"),
      ),
    ).toBe(true);
    expect(
      isUnmountedResizablePanelGroupError(
        new Error('Could not find Group with id "resizable-layout-foo"'),
      ),
    ).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(
      isUnmountedResizablePanelGroupError(
        new Error(
          "Group Context not found; did you render a Panel or Separator outside of a Group?",
        ),
      ),
    ).toBe(false);
    expect(isUnmountedResizablePanelGroupError(new Error("not found"))).toBe(
      false,
    );
    expect(isUnmountedResizablePanelGroupError("Group foo not found")).toBe(
      false,
    );
  });
});

describe("withMountedPanel", () => {
  it("returns the fallback when the panel ref is empty", () => {
    expect(withMountedPanel(null, (panel) => panel.isCollapsed(), true)).toBe(
      true,
    );
  });

  it("returns the callback result when the group is still registered", () => {
    const panel = panelStub({ isCollapsed: () => true });
    expect(withMountedPanel(panel, (p) => p.isCollapsed(), false)).toBe(true);
  });

  it("returns the fallback when the library throws a missing-group error", () => {
    const panel = panelStub({
      isCollapsed: () => {
        throw new Error(
          "Group resizable-layout-filter-layout-observations-events not found",
        );
      },
    });
    expect(withMountedPanel(panel, (p) => !p.isCollapsed(), true)).toBe(true);
  });

  it("rethrows unexpected imperative errors", () => {
    const panel = panelStub({
      expand: () => {
        throw new Error("Panel constraints not found for Panel secondary");
      },
    });
    expect(() => withMountedPanel(panel, (p) => p.expand(), undefined)).toThrow(
      "Panel constraints not found for Panel secondary",
    );
  });
});
