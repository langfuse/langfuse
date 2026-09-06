import { render } from "@testing-library/react";
import { Drawer, DrawerContent, DrawerTitle } from "@/src/components/ui/drawer";

function mountOverlayRoot() {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of [
    "panel",
    "agent",
    "modal",
    "popover",
    "tooltip",
    "toast",
  ]) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
}

describe("Drawer", () => {
  beforeEach(() => {
    mountOverlayRoot();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("sizes compact bottom drawers to their content instead of a third of the viewport", () => {
    render(
      <Drawer open forceDirection="bottom" shouldScaleBackground={false}>
        <DrawerContent id="compact-drawer">
          <DrawerTitle>Support</DrawerTitle>
          <button type="button">Email a Support Engineer</button>
        </DrawerContent>
      </Drawer>,
    );

    const drawer = document.querySelector("#compact-drawer");
    expect(drawer).not.toBeNull();
    const classes = drawer?.className.split(/\s+/) ?? [];
    expect(classes).not.toContain("h-1/3");
    expect(classes).toContain("h-auto");
    // Vaul paints a 200%-tall ::after below the sheet so a drag doesn't
    // expose a gap. `overflow-y-auto` would turn that into a hollow
    // scroll region under the last action.
    expect(classes).not.toContain("overflow-y-auto");
  });
});
