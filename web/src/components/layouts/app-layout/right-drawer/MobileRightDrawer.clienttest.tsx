import { render, screen } from "@testing-library/react";
import { MobileRightDrawer } from "@/src/components/layouts/app-layout/right-drawer/MobileRightDrawer";

const mocks = vi.hoisted(() => ({
  supportOpen: true,
  migrationOpen: false,
}));

vi.mock("@/src/features/support-chat/SupportDrawerProvider", () => ({
  useSupportDrawer: () => ({
    open: mocks.supportOpen,
    setOpen: vi.fn(),
  }),
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanelProvider", () => ({
  useV4MigrationPanel: () => ({
    open: mocks.migrationOpen,
    setOpen: vi.fn(),
  }),
}));

vi.mock("@/src/features/support-chat/SupportDrawer", () => ({
  SupportDrawer: () => <div>Email a Support Engineer</div>,
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanel", () => ({
  V4MigrationPanel: () => null,
}));

vi.mock("@/src/features/v4-migration/V4MigrationContent", () => ({
  useV4MigrationTitle: () => "Ensure compatibility after November 16",
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
    mocks.supportOpen = true;
    mocks.migrationOpen = false;
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

  it("includes the compatibility deadline in the accessible migration title", () => {
    mocks.supportOpen = false;
    mocks.migrationOpen = true;

    render(
      <MobileRightDrawer>
        <div>page</div>
      </MobileRightDrawer>,
    );

    expect(
      screen.getByText("Ensure compatibility after November 16"),
    ).toBeInTheDocument();
  });
});
