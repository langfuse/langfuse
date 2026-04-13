import { render, screen } from "@testing-library/react";
import { getSpielwieseDashboardVm } from "../adapters/dashboardVm";
import { useSpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";
import { SpielwieseSidebarRight } from "./SpielwieseSidebarRight";
import { SpielwieseShellProvider } from "./SpielwieseShellProvider";

function renderSidebarRight() {
  const dashboard = getSpielwieseDashboardVm();

  function TestSidebarRight() {
    const variablesState = useSpielwieseVariablesPanelState(
      dashboard.variablesPanel.items,
    );

    return (
      <SpielwieseSidebarRight
        dashboard={dashboard}
        variablesState={variablesState}
      />
    );
  }

  render(
    <SpielwieseShellProvider>
      <TestSidebarRight />
    </SpielwieseShellProvider>,
  );
}

describe("SpielwieseSidebarRight", () => {
  it("uses the flatter Spielwiese header band and removes top content padding", () => {
    renderSidebarRight();

    const sidebar = screen.getByTestId("spielwiese-right-sidebar");
    const header = screen.getByTestId("spielwiese-right-sidebar-header");
    const content = header.nextElementSibling as HTMLElement | null;

    expect(sidebar.className).toContain("bg-[#F3F3F4]");
    expect(header.className).toContain("p-0");
    expect(header.className).toContain("px-3");
    expect(header.className).toContain("pt-2");
    expect(header.className).toContain("pb-[11px]");
    expect(header.className).toContain(
      "shadow-[rgb(238,239,241)_0px_1px_0px_0px]",
    );
    expect(content).toBeTruthy();
    expect(content?.className).toContain("px-3");
    expect(content?.className).toContain("pt-0");
    expect(content?.className).toContain("pb-3");
    expect(content?.className).not.toContain("py-3");
  });
});
