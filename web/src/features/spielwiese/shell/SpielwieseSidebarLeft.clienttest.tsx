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
    "bg-[#FCFDFE]",
  );
  expect(screen.getByTestId("spielwiese-left-sidebar").className).not.toContain(
    "border-r",
  );
  expect(
    screen.getByTestId("spielwiese-left-sidebar-sticky-footer").className,
  ).not.toContain("border-t");
}

describe("SpielwieseSidebarLeft expanded", () => {
  it("renders the denser left rail structure", () => {
    renderExpandedSidebar("search");

    expect(
      screen.getByTestId("spielwiese-left-sidebar-scroll-area"),
    ).toBeTruthy();
    expect(screen.getByText("My Space")).toBeTruthy();
    expect(screen.getByText("New Document")).toBeTruthy();
    expect(screen.getByText("All Docs")).toBeTruthy();
    expect(screen.getByText("Tasks")).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("Imagine")).toBeTruthy();
    expect(screen.getByText("Starred")).toBeTruthy();
    expect(screen.getByText("Folders")).toBeTruthy();
    expect(screen.getByText("Tags")).toBeTruthy();
    expect(screen.getByText("How to use Craft")).toBeTruthy();
    expect(screen.getByText("Unsorted")).toBeTruthy();
    expect(screen.getByText("Open Questions Numia")).toBeTruthy();
    expect(screen.getByText("You are on the free plan")).toBeTruthy();
    expect(screen.getByText("Go Unlimited")).toBeTruthy();
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
    expect(screen.queryByText("Folders")).toBeNull();
    expect(screen.getByTitle("Desktop app")).toBeTruthy();
    expect(screen.getByTitle("Folders")).toBeTruthy();
  });
});
