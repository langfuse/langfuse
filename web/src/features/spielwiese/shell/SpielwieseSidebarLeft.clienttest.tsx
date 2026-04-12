import { render, screen } from "@testing-library/react";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import { SpielwieseSidebarLeft } from "./SpielwieseSidebarLeft";

function getFinderProps(pageId = "assistant") {
  const shell = getSpielwieseShellVm(pageId);
  const dashboard = getSpielwieseDashboardVm(pageId);

  return {
    breadcrumb: dashboard.header.breadcrumb,
    isOpen: false,
    onClose: () => {},
    onOpen: () => {},
    pageId: dashboard.pageId,
    shell,
  };
}

function renderExpandedSidebar(pageId = "assistant") {
  const shell = getSpielwieseShellVm(pageId);

  render(
    <SpielwieseSidebarLeft
      finderProps={getFinderProps(pageId)}
      shell={shell}
    />,
  );
}

function expectBorderlessSidebarChrome() {
  expect(screen.getByTestId("spielwiese-left-sidebar").className).toContain(
    "bg-[#F3F3F4]",
  );
  expect(screen.getByTestId("spielwiese-left-sidebar").className).not.toContain(
    "border-r",
  );
  expect(
    screen.queryByTestId("spielwiese-left-sidebar-sticky-footer"),
  ).toBeNull();
  expect(screen.queryByTestId("spielwiese-left-bottom-mode-switch")).toBeNull();
}

function expectPrimarySidebarButtonChrome(label: string) {
  const control = screen.getByText(label).closest("a, button, summary");

  expect(control).toBeTruthy();
  const className = control?.className ?? "";

  [
    "h-8",
    "rounded-[10px]",
    "px-1.5",
    "text-[0.875rem]",
    "text-[#242529]",
    "bg-[rgba(255,255,255,0.38)]",
    "border-[rgba(0,0,0,0.04)]",
    "hover:bg-[rgba(255,255,255,0.62)]",
  ].forEach((token) => expect(className).toContain(token));
  expect(control?.querySelector("[data-sidebar-icon]")).toBeTruthy();
  expect(control?.querySelector("[data-sidebar-icon-shell]")).toBeTruthy();
}

function expectSidebarSectionHeaderActionChrome(label: string) {
  const control = screen.getByRole("button", { name: `Add to ${label}` });

  expect(control).toBeTruthy();
  expect(control?.className).toContain("size-5");
  expect(control?.className).toContain("rounded-[7px]");
  expect(control?.className).toContain("text-black/[0.46]");
  expect(control?.className).toContain("hover:text-[#242529]");
  expect(control?.querySelector("[data-sidebar-icon]")).toBeTruthy();
}

function expectNestedTreeChrome(label: string) {
  const control = screen.getByText(label).closest("a");

  expect(control).toBeTruthy();
  expect(control?.className).toContain("rounded-[9px]");
  expect(control?.className).toContain("text-[0.875rem]");
  expect(control?.parentElement?.className).toContain("border-l");
  expect(control?.parentElement?.className).toContain("pl-2");
}

function expectDummyNestedTreeChrome(label: string) {
  const control = screen.getByText(label).closest("button");

  expect(control).toBeTruthy();
  expect(control?.className).toContain("rounded-[9px]");
  expect(control?.className).toContain("text-[0.875rem]");
  expect(control?.getAttribute("aria-disabled")).toBe("true");
  expect(control?.hasAttribute("data-sidebar-dummy")).toBe(true);
  expect(control?.parentElement?.className).toContain("border-l");
  expect(control?.parentElement?.className).toContain("pl-2");
}

function expectSidebarGroupRowChrome(label: string) {
  const control = screen.getByText(label).closest("summary");

  expect(control).toBeTruthy();
  expect(control?.className).toContain("rounded-[9px]");
  expect(control?.className).toContain("text-black/[0.55]");
  expect(control?.className).toContain("hover:text-black/[0.55]");
}

function expectSidebarHeaderChrome() {
  const sidebarHeader = screen.getByTestId(
    "spielwiese-left-sidebar-scroll-area",
  ).firstElementChild;

  expect(sidebarHeader?.className).toContain(
    "shadow-[rgb(238,239,241)_0px_1px_0px_0px]",
  );
  expect(sidebarHeader?.className).toContain("pt-2");
  expect(screen.queryByText("Rudel")).toBeNull();
}

describe("SpielwieseSidebarLeft expanded", () => {
  it("renders the simplified left rail structure and keeps search interactive", () => {
    renderExpandedSidebar();

    ["spielwiese-left-sidebar", "spielwiese-left-sidebar-scroll-area"].forEach(
      (testId) => expect(screen.getByTestId(testId)).toBeTruthy(),
    );

    [
      "Home",
      "Search",
      "Library",
      "Organization settings",
      "Documentation",
      "Files",
      "Example Evaluators",
      "Micronutrient tracker",
      "Vision Agent",
    ].forEach((label) => expect(screen.getByText(label)).toBeTruthy());

    expect(screen.queryByText("New Document")).toBeNull();
    expect(screen.queryByText("New")).toBeNull();
    expect(
      screen.getByText("Example Evaluators").closest("details")?.open,
    ).toBe(true);

    expectBorderlessSidebarChrome();
    expectSidebarHeaderChrome();
    expectPrimarySidebarButtonChrome("Home");
    expectPrimarySidebarButtonChrome("Library");
    expectSidebarGroupRowChrome("Example Evaluators");
    expectSidebarSectionHeaderActionChrome("Files");
    expectNestedTreeChrome("Micronutrient tracker");
    expectDummyNestedTreeChrome("Vision Agent");
    expect(
      screen
        .getByText("Micronutrient tracker")
        .closest("a")
        ?.getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByLabelText("Open workspace finder")).toBeTruthy();
  });
});

describe("SpielwieseSidebarLeft compact", () => {
  it("collapses to icon-first controls in compact mode", () => {
    render(
      <SpielwieseSidebarLeft
        compact
        shell={getSpielwieseShellVm("assistant")}
      />,
    );

    expect(screen.getByTestId("spielwiese-left-sidebar")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-left-sidebar-scroll-area"),
    ).toBeTruthy();
    expect(screen.queryByText("New Document")).toBeNull();
    expect(screen.queryByText("Files")).toBeNull();
    expect(screen.getByTitle("Desktop app")).toBeTruthy();
    expect(screen.getByTitle("Files")).toBeTruthy();
    expect(screen.getByTitle("Home").className).toContain("size-8");
  });
});
