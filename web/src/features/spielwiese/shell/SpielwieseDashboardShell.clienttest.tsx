import { fireEvent, render, screen, within } from "@testing-library/react";
import { SpielwieseDashboardShell } from "./SpielwieseDashboardShell";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";

function renderShell(children = <div>Shell content</div>) {
  const shell = getSpielwieseShellVm();
  const dashboard = getSpielwieseDashboardVm();

  return render(
    <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
      {children}
    </SpielwieseDashboardShell>,
  );
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

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
  expect(workspaceSwitch?.className).toContain("ml-px");
  expect(workspaceSwitch?.className).toContain("pl-[3px]");
  expect(workspaceSwitch?.className).toContain("pr-2.5");
  expect(workspaceSwitch?.className).not.toContain("pl-1");
  expect(workspaceSwitch?.className).not.toContain("hover:bg-black/[0.03]");
  expect(workspaceSwitch?.getAttribute("aria-disabled")).toBe("true");
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
  it("renders a local shell without product preview chrome", () => {
    expectShellRenderStructure(renderShell().container);
  });
});

describe("SpielwieseDashboardShell chrome keeps the sidebar toggles active", () => {
  it("keeps both sidebar toggles interactive while the other header controls stay inert", () => {
    window.matchMedia = ((query: string) =>
      ({
        matches:
          query === "(min-width: 768px)" || query === "(min-width: 1280px)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      }) as MediaQueryList) as typeof window.matchMedia;
    renderShell();
    const shellRoot = screen.getByTestId("spielwiese-shell");
    const leftToggle = screen.getByTestId("spielwiese-left-toggle");
    const rightToggle = screen.getByTestId("spielwiese-right-toggle");
    expect(leftToggle.getAttribute("aria-disabled")).toBeNull();
    expect(rightToggle.getAttribute("aria-disabled")).toBeNull();
    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("false");
    expect(shellRoot.getAttribute("data-right-open")).toBe("true");
    fireEvent.click(leftToggle);
    fireEvent.click(rightToggle);
    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("true");
    expect(shellRoot.getAttribute("data-right-open")).toBe("false");
    expect(screen.queryByTestId("spielwiese-mobile-backdrop")).toBeNull();
  });
});
