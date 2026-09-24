import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MobileRightDrawer } from "@/src/components/layouts/app-layout/right-drawer/MobileRightDrawer";
import { AppContentWithRightDrawer } from "@/src/components/layouts/app-layout/right-drawer/AppContentWithRightDrawer";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

const mocks = vi.hoisted(() => ({
  supportOpen: true,
  migrationOpen: false,
  isDesktop: true,
}));

vi.mock("react-responsive", () => ({
  useMediaQuery: () => mocks.isDesktop,
}));

vi.mock("@/src/components/ui/resizable-split-layout", () => ({
  ResizableSplitLayout: ({
    primaryContent,
    secondaryContent,
    open,
  }: {
    primaryContent: ReactNode;
    secondaryContent: ReactNode;
    open: boolean;
  }) => (
    <div>
      <main>{primaryContent}</main>
      {open ? secondaryContent : null}
    </div>
  ),
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
  V4MigrationPanel: () => <div>Migration panel</div>,
}));

vi.mock("@/src/features/v4-migration/V4MigrationContent", () => ({
  useV4MigrationTitle: () => "Ensure compatibility after November 16",
}));

describe("MobileRightDrawer", () => {
  beforeEach(() => {
    mocks.supportOpen = true;
    mocks.migrationOpen = false;
    mocks.isDesktop = true;
  });

  it("does not stretch the support sheet to the full viewport", () => {
    render(<MobileRightDrawer />, { wrapper: LayerProvider });

    const drawer = document.querySelector("#support-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer?.className).not.toContain("min-h-screen-with-banner");
  });

  it("includes the compatibility deadline in the accessible migration title", () => {
    mocks.supportOpen = false;
    mocks.migrationOpen = true;

    render(<MobileRightDrawer />, { wrapper: LayerProvider });

    expect(
      screen.getByText("Ensure compatibility after November 16"),
    ).toBeInTheDocument();
  });

  it("preserves routed page state across breakpoints and shows each drawer once", async () => {
    mocks.supportOpen = false;
    function PageDraft() {
      const [value, setValue] = useState("");
      return (
        <input
          aria-label="Page draft"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    const page = () => (
      <AppContentWithRightDrawer>
        <PageDraft />
      </AppContentWithRightDrawer>
    );
    const { rerender } = render(page(), { wrapper: LayerProvider });
    const draft = screen.getByLabelText("Page draft");
    fireEvent.change(draft, { target: { value: "Unsent review" } });

    mocks.isDesktop = false;
    rerender(page());
    await waitFor(() =>
      expect(screen.getByLabelText("Page draft")).toBe(draft),
    );
    expect(draft).toHaveValue("Unsent review");

    mocks.supportOpen = true;
    rerender(page());
    expect(await screen.findByText("Email a Support Engineer")).toBeVisible();
    expect(screen.getAllByText("Email a Support Engineer")).toHaveLength(1);

    mocks.supportOpen = false;
    mocks.migrationOpen = true;
    rerender(page());
    expect(await screen.findByText("Migration panel")).toBeVisible();
    expect(screen.getAllByText("Migration panel")).toHaveLength(1);

    mocks.isDesktop = true;
    rerender(page());
    await waitFor(() =>
      expect(screen.getAllByText("Migration panel")).toHaveLength(1),
    );
    expect(screen.getByLabelText("Page draft")).toBe(draft);
    expect(draft).toHaveValue("Unsent review");
  });
});
