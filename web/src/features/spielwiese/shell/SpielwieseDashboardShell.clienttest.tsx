/* eslint-disable max-lines */
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

function setElementRect(
  element: HTMLElement,
  rect: {
    height: number;
    left: number;
    top: number;
    width: number;
  },
) {
  const domRect = {
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    toJSON: () => ({}),
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
  } as DOMRect;

  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => domRect,
  });
}

function renderClickGuideShell({
  includeCoveredAction = false,
}: {
  includeCoveredAction?: boolean;
} = {}) {
  renderShell(
    <div data-testid="spielwiese-empty-click-surface">
      <button data-testid="spielwiese-functional-action" type="button">
        Functional action
      </button>
      <button
        aria-disabled="true"
        data-testid="spielwiese-disabled-action"
        type="button"
      >
        Disabled action
      </button>
      {includeCoveredAction ? (
        <button data-testid="spielwiese-covered-action" type="button">
          Covered action
        </button>
      ) : null}
    </div>,
  );

  setElementRect(screen.getByTestId("spielwiese-shell"), {
    height: 480,
    left: 0,
    top: 0,
    width: 640,
  });
  setElementRect(screen.getByTestId("spielwiese-functional-action"), {
    height: 32,
    left: 120,
    top: 96,
    width: 148,
  });
  setElementRect(screen.getByTestId("spielwiese-disabled-action"), {
    height: 32,
    left: 288,
    top: 96,
    width: 132,
  });

  if (includeCoveredAction) {
    setElementRect(screen.getByTestId("spielwiese-covered-action"), {
      height: 32,
      left: 440,
      top: 96,
      width: 124,
    });
  }
}

function withCoveredActionHitTestMock({
  coveredAction,
  emptySurface,
  functionalAction,
  run,
}: {
  coveredAction: HTMLElement;
  emptySurface: HTMLElement;
  functionalAction: HTMLElement;
  run: () => void;
}) {
  const originalElementFromPoint = document.elementFromPoint;

  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: (x: number, y: number) => {
      const coveredRect = coveredAction.getBoundingClientRect();

      if (
        x >= coveredRect.left &&
        x <= coveredRect.right &&
        y >= coveredRect.top &&
        y <= coveredRect.bottom
      ) {
        return emptySurface;
      }

      return functionalAction;
    },
  });

  try {
    run();
  } finally {
    if (originalElementFromPoint) {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
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

describe("SpielwieseDashboardShell click guide", () => {
  it("flashes blue hotspots when a click misses enabled controls", () => {
    renderClickGuideShell();

    fireEvent.click(screen.getByTestId("spielwiese-empty-click-surface"));

    const overlay = screen.getByTestId("spielwiese-click-guide-overlay");
    const targets = screen.getAllByTestId("spielwiese-click-guide-target");

    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(targets).toHaveLength(1);
    expect(targets[0]?.className).toContain(
      "animate-spielwiese-click-guide-pulse",
    );
    expect(targets[0]?.className).toContain("border-[rgba(0,113,227,0.28)]");
    expect(targets[0]?.className).toContain("bg-[rgba(0,113,227,0.025)]");
    expect(targets[0]?.style.left).toBe("120px");
    expect(targets[0]?.style.top).toBe("96px");
    expect(targets[0]?.style.width).toBe("148px");
    expect(targets[0]?.style.height).toBe("32px");
  });

  it("keeps hotspots aligned when the shell scrolls", () => {
    renderClickGuideShell();

    fireEvent.click(screen.getByTestId("spielwiese-empty-click-surface"));

    expect(screen.getByTestId("spielwiese-click-guide-target").style.top).toBe(
      "96px",
    );

    setElementRect(screen.getByTestId("spielwiese-functional-action"), {
      height: 32,
      left: 120,
      top: 156,
      width: 148,
    });

    fireEvent.scroll(screen.getByTestId("spielwiese-shell"));

    expect(screen.getByTestId("spielwiese-click-guide-target").style.top).toBe(
      "156px",
    );
  });
});

describe("SpielwieseDashboardShell click guide hit testing", () => {
  it("does not flash controls that cannot receive pointer clicks", () => {
    renderClickGuideShell({ includeCoveredAction: true });

    const coveredAction = screen.getByTestId("spielwiese-covered-action");
    const emptySurface = screen.getByTestId("spielwiese-empty-click-surface");
    const functionalAction = screen.getByTestId("spielwiese-functional-action");

    withCoveredActionHitTestMock({
      coveredAction,
      emptySurface,
      functionalAction,
      run: () => {
        fireEvent.click(emptySurface);

        const targets = screen.getAllByTestId("spielwiese-click-guide-target");

        expect(targets).toHaveLength(1);
        expect(targets[0]?.style.left).toBe("120px");
      },
    });
  });

  it("does not flash the click guide when clicking an enabled control", () => {
    renderClickGuideShell();

    fireEvent.click(screen.getByTestId("spielwiese-functional-action"));

    expect(screen.queryByTestId("spielwiese-click-guide-overlay")).toBeNull();
  });

  it("treats disabled controls as missed clicks", () => {
    renderClickGuideShell();

    fireEvent.click(screen.getByTestId("spielwiese-disabled-action"));

    expect(screen.getByTestId("spielwiese-click-guide-overlay")).toBeTruthy();
    expect(screen.getAllByTestId("spielwiese-click-guide-target")).toHaveLength(
      1,
    );
  });
});
