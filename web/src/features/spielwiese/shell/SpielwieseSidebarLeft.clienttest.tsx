import { render, screen } from "@testing-library/react";
import { getSpielwieseShellVm } from "../adapters/dashboardVm";
import { SpielwieseSidebarLeft } from "./SpielwieseSidebarLeft";

describe("SpielwieseSidebarLeft", () => {
  it("renders the denser left rail structure", () => {
    render(<SpielwieseSidebarLeft shell={getSpielwieseShellVm("search")} />);

    expect(screen.getByText("New Document")).toBeTruthy();
    expect(screen.getByText("All Docs")).toBeTruthy();
    expect(screen.getByText("Tasks")).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("Imagine")).toBeTruthy();
    expect(screen.getByText("Starred")).toBeTruthy();
    expect(screen.getByText("Folders")).toBeTruthy();
    expect(screen.getByText("Tags")).toBeTruthy();
    expect(screen.getByText("Macroextractor Runbook")).toBeTruthy();
    expect(screen.getByText("Search Index")).toBeTruthy();
    expect(screen.getByText("You are on the free plan")).toBeTruthy();
    expect(screen.getByText("Go Unlimited")).toBeTruthy();
  });

  it("collapses to icon-first controls in compact mode", () => {
    render(
      <SpielwieseSidebarLeft
        compact
        shell={getSpielwieseShellVm("assistant")}
      />,
    );

    expect(screen.getByTestId("spielwiese-left-sidebar")).toBeTruthy();
    expect(screen.queryByText("New Document")).toBeNull();
    expect(screen.queryByText("Folders")).toBeNull();
    expect(screen.getByTitle("Desktop app")).toBeTruthy();
    expect(screen.getByTitle("Folders")).toBeTruthy();
  });
});
