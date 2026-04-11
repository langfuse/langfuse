import { fireEvent, render, screen } from "@testing-library/react";
import { getSpielwieseShellVm } from "../adapters/dashboardVm";
import { SpielwieseSidebarLeft } from "./SpielwieseSidebarLeft";

function renderExpandedSidebar(pageId = "assistant") {
  render(<SpielwieseSidebarLeft shell={getSpielwieseShellVm(pageId)} />);
}

function expectModeButtons(folderPressed: "true" | "false") {
  const documentPressed = folderPressed === "true" ? "false" : "true";

  expect(
    screen.getByLabelText("Folder view").getAttribute("aria-pressed"),
  ).toBe(folderPressed);
  expect(
    screen.getByLabelText("Document view").getAttribute("aria-pressed"),
  ).toBe(documentPressed);
}

function expectBorderlessSidebarChrome() {
  expect(screen.getByTestId("spielwiese-left-sidebar").className).toContain(
    "bg-[#F5F5F5]",
  );
  expect(screen.getByTestId("spielwiese-left-sidebar").className).not.toContain(
    "border-r",
  );
  expect(
    screen.getByTestId("spielwiese-left-sidebar-sticky-footer").className,
  ).not.toContain("border-t");
}

function expectSidebarButtonChrome(
  label: string,
  options?: { active?: boolean },
) {
  const link = screen.getByText(label).closest("a");

  expect(link).toBeTruthy();
  expect(link?.className).toContain("h-8");
  expect(link?.className).toContain("rounded-[10px]");
  expect(link?.className).toContain("text-[13px]");
  expect(link?.querySelector("[data-sidebar-icon]")).toBeTruthy();

  if (options?.active) {
    expect(link?.className).toContain("bg-background");
  }
}

describe("SpielwieseSidebarLeft expanded", () => {
  it("renders the denser left rail structure", () => {
    renderExpandedSidebar("search");

    expect(
      screen.getByTestId("spielwiese-left-sidebar-scroll-area"),
    ).toBeTruthy();
    expect(screen.getByText("My Space")).toBeTruthy();
    expect(screen.getByText("New Document")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Search")).toBeTruthy();
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.getByText("Organization settings")).toBeTruthy();
    expect(screen.getByText("Documentation")).toBeTruthy();
    expect(screen.getByText("Files")).toBeTruthy();
    expect(screen.getByText("Example Evaluators")).toBeTruthy();
    expect(screen.getByText("Comedian Bot")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.queryByText("All Docs")).toBeNull();
    expect(screen.queryByText("Folders")).toBeNull();
    expect(screen.queryByText("Go Unlimited")).toBeNull();
    expect(
      screen.getByTestId("spielwiese-left-bottom-mode-switch"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-left-sidebar-sticky-footer"),
    ).toBeTruthy();
    expectBorderlessSidebarChrome();
    expectModeButtons("true");
    expect(screen.getByLabelText("Folder view")).toBeTruthy();
    expect(screen.getByLabelText("Document view")).toBeTruthy();
    expectSidebarButtonChrome("Home");
    expectSidebarButtonChrome("Search", { active: true });
    expectSidebarButtonChrome("Comedian Bot");
  });

  it("switches the scrollable rail to the second page from the sticky footer", () => {
    renderExpandedSidebar();

    fireEvent.click(screen.getByLabelText("Document view"));

    expect(screen.queryByText("My Space")).toBeNull();
    expect(screen.getByText("Table of Contents")).toBeTruthy();
    expect(
      screen.getByText(
        "Use titles, pages or cards to create a table of contents.",
      ),
    ).toBeTruthy();
    expectModeButtons("false");
  });

  it("switches the second page inner tabs", () => {
    renderExpandedSidebar();

    fireEvent.click(screen.getByLabelText("Document view"));
    fireEvent.click(screen.getByLabelText("Checklist"));

    expect(
      screen.getByTestId("spielwiese-document-panel-title").textContent,
    ).toBe("Checklist");
    expect(
      screen.getByTestId("spielwiese-document-panel-description").textContent,
    ).toBe("Create tasks in the page to turn this area into an action list.");
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
