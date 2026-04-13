/* eslint-disable max-lines */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SpielwieseDashboardShell } from "./SpielwieseDashboardShell";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";

function createMatchMedia(matches: boolean) {
  return jest.fn().mockImplementation((query: string) => ({
    addEventListener: jest.fn(),
    matches,
    media: query,
    onchange: null,
    removeEventListener: jest.fn(),
  }));
}

function renderShell(children = <div>Shell content</div>) {
  const shell = getSpielwieseShellVm();
  const dashboard = getSpielwieseDashboardVm();

  render(
    <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
      {children}
    </SpielwieseDashboardShell>,
  );
}

const originalMatchMedia = window.matchMedia;
const originalHash = window.location.hash;

function openFinder() {
  fireEvent.click(screen.getByTestId("spielwiese-header-finder-trigger"));
  return screen.getByTestId("spielwiese-header-finder-panel");
}

function expectFinderPanelChrome(panel: HTMLElement) {
  const searchField = within(panel).getByTestId(
    "spielwiese-header-finder-search-field",
  );
  const firstResult = within(panel).getAllByTestId(
    "spielwiese-header-finder-result",
  )[0];
  const surface = panel.lastElementChild as HTMLElement | null;

  expect(panel.className).toContain("max-w-none");
  expect(surface?.className).toContain("rounded-[1.05rem]");
  expect(surface?.className).toContain("bg-[rgba(251,251,251,0.96)]");
  expect(searchField.className).toContain("border-b");
  expect(searchField.className).toContain("px-2");
  expect(searchField.className).toContain("py-2");
  expect(firstResult?.className).toContain("h-[2.875rem]");
  expect(firstResult?.className).toContain("rounded-[0.8rem]");
}

function expectShellChromeBackground() {
  expect(screen.getByTestId("spielwiese-shell").className).toContain(
    "bg-[#F3F3F4]",
  );
  expect(screen.getByTestId("spielwiese-shell-header").className).toContain(
    "bg-[#F3F3F4]",
  );
  expect(
    screen
      .getAllByTestId("spielwiese-right-sidebar")
      .every((sidebar) => sidebar.className.includes("bg-[#F3F3F4]")),
  ).toBe(true);
}

function expectShellChromeWithoutBorders() {
  expect(screen.getByTestId("spielwiese-shell-header").className).not.toContain(
    "border-b",
  );
  expect(
    screen
      .getAllByTestId("spielwiese-right-sidebar")
      .every((sidebar) => !sidebar.className.includes("border-l")),
  ).toBe(true);
  expect(
    screen
      .getAllByTestId("spielwiese-right-sidebar-header")
      .every((header) => !header.className.includes("border-b")),
  ).toBe(true);
}

function expectInsetSidebarShells() {
  const leftShell = screen.getByTestId("spielwiese-shell-left");
  const rightShell = screen.getByTestId("spielwiese-shell-right");
  const leftInnerShell = leftShell.firstElementChild;
  const rightInnerShell = rightShell.firstElementChild;

  expect(leftShell.className).toContain("box-border");
  expect(leftShell.className).toContain("bg-[#EEEFF1]");
  expect(leftShell.className).toContain("pl-2");
  expect(leftShell.className).toContain("pb-2");
  expect(leftShell.className).toContain(
    "shadow-[inset_8px_0_0_#F3F3F4,inset_0_-8px_0_#F3F3F4]",
  );
  expect(leftShell.className).not.toContain("pt-2");
  expect(leftShell.className).not.toContain("p-2");
  expect(leftInnerShell?.className).toContain("rounded-l-[8px]");
  expect(leftInnerShell?.className).not.toContain("rounded-[8px]");
  expect(leftInnerShell?.className).not.toContain("rounded-r-[8px]");
  expect(rightShell.className).toContain("box-border");
  expect(rightShell.className).toContain("bg-[#F3F3F4]");
  expect(rightShell.className).toContain("pr-2");
  expect(rightShell.className).toContain("pb-2");
  expect(rightShell.className).not.toContain("pt-2");
  expect(rightShell.className).not.toContain("p-2");
  expect(rightInnerShell?.className).toContain("rounded-r-[8px]");
  expect(rightInnerShell?.className).not.toContain("rounded-[8px]");
  expect(rightInnerShell?.className).not.toContain("rounded-l-[8px]");
}

function expectMainColumnWithoutExtraTopInset() {
  expect(screen.getByTestId("spielwiese-shell-main").className).toContain(
    "overflow-hidden",
  );
  expect(screen.getByTestId("spielwiese-shell-main").className).not.toContain(
    "pt-2",
  );
  expect(screen.getByTestId("spielwiese-shell-main").className).not.toContain(
    "pt-3",
  );
}

function expectCenteredHeaderContent() {
  const headerInnerClassName = screen.getByTestId("spielwiese-shell-header")
    .firstElementChild?.className;

  expect(headerInnerClassName).toContain("items-stretch");
  expect(headerInnerClassName).toContain("pb-0");
}

function expectWorkspaceSwitcherMovedToHeader() {
  const header = screen.getByTestId("spielwiese-shell-header");
  const workspaceSwitch = within(header).getByText("Rudel").closest("a");

  expect(workspaceSwitch).toBeTruthy();
  expect(workspaceSwitch?.className).toContain(
    "h-[calc(var(--spielwiese-header-height)-4px)]",
  );
  expect(workspaceSwitch?.className).toContain("max-w-[12rem]");
  expect(workspaceSwitch?.querySelector("svg")).toBeTruthy();
  expect(
    within(screen.getByTestId("spielwiese-shell-left")).queryByText("Rudel"),
  ).toBeNull();
}

function expectFinderMovedToLeftSidebar() {
  expect(
    within(screen.getByTestId("spielwiese-shell-header")).queryByTestId(
      "spielwiese-header-finder-trigger",
    ),
  ).toBeNull();
  expect(
    within(screen.getByTestId("spielwiese-shell-left")).getByTestId(
      "spielwiese-header-finder-trigger",
    ),
  ).toBeTruthy();
}

function expectSmallScreenOverlay() {
  const overlay = screen.getByTestId("spielwiese-shell-small-screen-overlay");

  expect(overlay).toBeTruthy();
  expect(overlay.textContent).toContain("Please view on a larger screen.");
  expect(overlay.className).toContain("absolute");
  expect(overlay.className).toContain("inset-0");
  expect(overlay.className).toContain("z-50");
  expect(overlay.className).toContain("hidden");
  expect(overlay.className).toContain("max-[499px]:flex");
  expect(overlay.className).toContain("bg-white");
  expect(overlay.className).toContain("items-center");
  expect(overlay.className).toContain("justify-center");
  expect(overlay.className).toContain("text-[#8B8B8D]");
}

function expectShellRenderStructure(container: HTMLElement) {
  expect(screen.getByText("Shell content")).toBeTruthy();
  expect(screen.queryByText("langofuso")).toBeNull();
  expect(screen.queryByText("langfuse-redesign")).toBeNull();
  expect(screen.queryByText("Macroextractor")).toBeNull();
  expect(screen.getAllByText("0 variables").length >= 1).toBeTruthy();
  expect(screen.queryByTestId("spielwiese-insert-panel")).toBeNull();
  expect(
    container.querySelector("[data-testid='spielwiese-shell']"),
  ).toBeTruthy();
  expect(screen.getByTestId("spielwiese-shell-header")).toBeTruthy();
  expectCenteredHeaderContent();
  expectWorkspaceSwitcherMovedToHeader();
  expect(screen.getByTestId("spielwiese-shell-body")).toBeTruthy();
  expectFinderMovedToLeftSidebar();
  expect(screen.getAllByText("Search").length >= 1).toBeTruthy();
  expect(screen.getByTestId("spielwiese-shell").className).toContain(
    "h-screen-with-banner",
  );
  expect(screen.getByTestId("spielwiese-shell").className).toContain(
    "[--spielwiese-header-height:2.75rem]",
  );
  expect(screen.getByTestId("spielwiese-shell").className).toContain(
    "relative",
  );
  expect(screen.getByTestId("spielwiese-shell").className).toContain(
    "sm:[--spielwiese-header-height:3rem]",
  );
  expect(screen.getByTestId("spielwiese-shell-body").className).toContain(
    "overflow-hidden",
  );
  expect(screen.getByTestId("spielwiese-shell-body").className).toContain(
    "md:grid-cols-[15.625rem_minmax(0,1fr)]",
  );
  expectMainColumnWithoutExtraTopInset();
  expect(screen.getByTestId("spielwiese-shell-main").className).not.toContain(
    "px-3",
  );
  expect(screen.getByTestId("spielwiese-shell-main").className).not.toContain(
    "sm:px-5",
  );
  expectShellChromeBackground();
  expectShellChromeWithoutBorders();
  expectInsetSidebarShells();
  expectSmallScreenOverlay();
  expect(
    screen
      .getByTestId("spielwiese-shell-header")
      .compareDocumentPosition(screen.getByTestId("spielwiese-shell-body")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

describe("SpielwieseDashboardShell render", () => {
  afterEach(() => {
    window.location.hash = originalHash;
    window.matchMedia = originalMatchMedia;
  });

  it("renders a local shell without product preview chrome", () => {
    const shell = getSpielwieseShellVm();
    const dashboard = getSpielwieseDashboardVm();
    const { container } = render(
      <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
        <div>Shell content</div>
      </SpielwieseDashboardShell>,
    );

    expectShellRenderStructure(container);
  });
});

describe("SpielwieseDashboardShell sidebar interactions", () => {
  afterEach(() => {
    window.location.hash = originalHash;
    window.matchMedia = originalMatchMedia;
  });

  it("toggles the desktop left rail collapse state from the local shell", () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      addEventListener: jest.fn(),
      matches: query === "(min-width: 768px)",
      media: query,
      onchange: null,
      removeEventListener: jest.fn(),
    }));

    renderShell();

    const shellRoot = screen.getByTestId("spielwiese-shell");
    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("false");

    fireEvent.click(screen.getByTestId("spielwiese-left-toggle"));

    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("true");
  });

  it("opens mobile drawers below the sticky header", () => {
    window.matchMedia = createMatchMedia(false);

    renderShell();

    fireEvent.click(screen.getByTestId("spielwiese-left-toggle"));

    expect(screen.getByTestId("spielwiese-mobile-backdrop")).toBeTruthy();
    expect(
      screen
        .getByTestId("spielwiese-mobile-left-drawer")
        .className.includes("top-[var(--spielwiese-shell-offset)]"),
    ).toBe(true);
    expect(
      screen.getByTestId("spielwiese-mobile-left-drawer").className,
    ).toContain("bg-[#EEEFF1]");
    expect(
      screen.getByTestId("spielwiese-mobile-left-drawer").className,
    ).toContain("w-[15.625rem]");
    expect(
      screen.getByTestId("spielwiese-mobile-left-drawer").className,
    ).not.toContain("border-r");

    fireEvent.click(screen.getByTestId("spielwiese-mobile-backdrop"));
    fireEvent.click(screen.getByTestId("spielwiese-right-toggle"));

    expect(
      screen
        .getByTestId("spielwiese-mobile-right-drawer")
        .className.includes("top-[var(--spielwiese-shell-offset)]"),
    ).toBe(true);
    expect(
      screen.getByTestId("spielwiese-mobile-right-drawer").className,
    ).toContain("bg-[#F3F3F4]");
    expect(
      screen.getByTestId("spielwiese-mobile-right-drawer").className,
    ).not.toContain("border-l");
    expect(screen.getByTestId("spielwiese-mobile-backdrop")).toBeTruthy();
  });
});

describe("SpielwieseDashboardShell finder interactions", () => {
  afterEach(() => {
    window.location.hash = originalHash;
    window.matchMedia = originalMatchMedia;
  });

  it("opens the header finder from the trigger and filters its results", () => {
    renderShell();

    const panel = openFinder();
    const panelContainer = screen.getByTestId(
      "spielwiese-header-finder-container",
    );
    const searchInput = within(panel).getByLabelText("Find in workspace");

    expect(searchInput).toBeTruthy();
    expect(within(panel).getByText("Home")).toBeTruthy();
    expect(panelContainer.className).toContain("absolute");
    expect(panelContainer.className).toContain("top-0");
    expect(panelContainer.className).toContain("inset-x-0");
    expect(panelContainer.className).not.toContain("fixed");
    expect(panelContainer.className).not.toContain("mt-2");
    expectFinderPanelChrome(panel);

    fireEvent.change(searchInput, { target: { value: "micro" } });

    expect(within(panel).getByText("Micronutrient tracker")).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "vision" } });

    expect(within(panel).getByText("Vision Agent")).toBeTruthy();
    expect(within(panel).queryByText("Documentation")).toBeNull();
  });

  it("opens the finder from the F shortcut but ignores editable targets", () => {
    renderShell(<input data-testid="shell-content-input" />);

    fireEvent.keyDown(screen.getByTestId("shell-content-input"), {
      key: "f",
    });

    expect(screen.queryByTestId("spielwiese-header-finder-panel")).toBeNull();

    fireEvent.keyDown(screen.getByTestId("spielwiese-shell"), { key: "f" });

    expect(screen.getByTestId("spielwiese-header-finder-panel")).toBeTruthy();

    fireEvent.keyDown(screen.getByLabelText("Find in workspace"), {
      key: "Escape",
    });

    expect(screen.queryByTestId("spielwiese-header-finder-panel")).toBeNull();
  });

  it("updates the hash when a finder result is selected", () => {
    renderShell();

    const panel = openFinder();
    fireEvent.change(screen.getByLabelText("Find in workspace"), {
      target: { value: "vision" },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: /Vision Agent/i }),
    );

    expect(window.location.hash).toBe("#vision-agent");
    expect(screen.queryByTestId("spielwiese-header-finder-panel")).toBeNull();
  });
});
