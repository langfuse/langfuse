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
    "bg-[#F3F3F4]",
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

    [
      "spielwiese-left-sidebar-scroll-area",
      "spielwiese-left-bottom-mode-switch",
      "spielwiese-left-sidebar-sticky-footer",
    ].forEach((testId) => expect(screen.getByTestId(testId)).toBeTruthy());

    [
      "My Space",
      "New Document",
      "Home",
      "Search",
      "Library",
      "Organization settings",
      "Documentation",
      "Files",
      "Example Evaluators",
      "Comedian Bot",
      "New",
    ].forEach((label) => expect(screen.getByText(label)).toBeTruthy());

    ["All Docs", "Folders", "Go Unlimited"].forEach((label) =>
      expect(screen.queryByText(label)).toBeNull(),
    );
    expectBorderlessSidebarChrome();
    expectModeButtons("true");
    expect(screen.getByLabelText("Folder view")).toBeTruthy();
    expect(screen.getByLabelText("Document view")).toBeTruthy();
    expectSidebarButtonChrome("Home");
    expectSidebarButtonChrome("Search", { active: true });
    expectSidebarButtonChrome("Comedian Bot");
  });
});

describe("SpielwieseSidebarLeft document mode", () => {
  it("switches the scrollable rail to the second page from the sticky footer", () => {
    renderExpandedSidebar();

    fireEvent.click(screen.getByLabelText("Document view"));

    expect(screen.queryByText("My Space")).toBeNull();
    ["Prompt Engineering", "Deployment", "Observability"].forEach((label) => {
      expect(screen.getByLabelText(label)).toBeTruthy();
    });
    expect(screen.queryByLabelText("Evaluation")).toBeNull();
    expect(
      screen.getByTestId("spielwiese-document-panel-tabs").className,
    ).toContain("flex-col");
    expect(
      screen.getByText(
        "Draft, test, refine, and evaluate prompt behavior before promoting changes.",
      ),
    ).toBeTruthy();
    expectModeButtons("false");
  });

  it("switches the second page inner tabs", () => {
    renderExpandedSidebar();

    fireEvent.click(screen.getByLabelText("Document view"));
    fireEvent.click(screen.getByLabelText("Deployment"));

    expect(
      screen.getByTestId("spielwiese-document-panel-title").textContent,
    ).toBe("Deployment");
    expect(
      screen.getByTestId("spielwiese-document-panel-description").textContent,
    ).toBe(
      "Promote prompt versions with deployment labels so applications resolve the intended prompt in production.",
    );
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
