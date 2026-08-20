import { render } from "@testing-library/react";
import { MobileRightDrawer } from "@/src/components/layouts/app-layout/right-drawer/MobileRightDrawer";

vi.mock("@/src/features/support-chat/SupportDrawerProvider", () => ({
  useSupportDrawer: () => ({
    open: true,
    setOpen: vi.fn(),
  }),
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanelProvider", () => ({
  useV4MigrationPanel: () => ({
    open: false,
    setOpen: vi.fn(),
  }),
}));

vi.mock("@/src/features/support-chat/SupportDrawer", () => ({
  SupportDrawer: () => <div>Email a Support Engineer</div>,
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanel", () => ({
  V4MigrationPanel: () => null,
}));

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

describe("MobileRightDrawer", () => {
  beforeEach(() => {
    mountOverlayRoot();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("does not stretch the support sheet to the full viewport", () => {
    render(
      <MobileRightDrawer>
        <div>page</div>
      </MobileRightDrawer>,
    );

    const drawer = document.querySelector("#support-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer?.className).not.toContain("min-h-screen-with-banner");
  });
});
