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

const originalHash = window.location.hash;

afterEach(() => {
  window.location.hash = originalHash;
});

function openFinderFromClick() {
  fireEvent.click(screen.getByTestId("spielwiese-header-finder-trigger"));
  return screen.getByTestId("spielwiese-header-finder-panel");
}

function openFinderFromKeyboard() {
  fireEvent.keyDown(screen.getByTestId("spielwiese-shell"), { key: "f" });
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

describe("SpielwieseDashboardShell finder interactions", () => {
  it("opens the finder from the sidebar search trigger and filters its results", () => {
    renderShell();
    const finderTrigger = screen.getByTestId(
      "spielwiese-header-finder-trigger",
    );

    expect(finderTrigger.getAttribute("aria-disabled")).toBeNull();
    expect(finderTrigger.className).toContain("bg-[#EEEFF1]");

    const panel = openFinderFromClick();
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
    expect(openFinderFromKeyboard()).toBeTruthy();

    fireEvent.keyDown(screen.getByLabelText("Find in workspace"), {
      key: "Escape",
    });

    expect(screen.queryByTestId("spielwiese-header-finder-panel")).toBeNull();
  });

  it("updates the hash when a finder result is selected", () => {
    renderShell();

    const panel = openFinderFromClick();

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
