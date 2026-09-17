import { render, screen } from "@testing-library/react";
import { MobileRightDrawer } from "./MobileRightDrawer";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

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

describe("MobileRightDrawer", () => {
  beforeEach(() => {
    mocks.supportOpen = true;
    mocks.migrationOpen = false;
  });

  it("does not stretch the support sheet to the full viewport", () => {
    render(
      <MobileRightDrawer>
        <div>page</div>
      </MobileRightDrawer>,
      { wrapper: LayerProvider },
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
      { wrapper: LayerProvider },
    );

    expect(
      screen.getByText("Ensure compatibility after November 16"),
    ).toBeInTheDocument();
  });
});
