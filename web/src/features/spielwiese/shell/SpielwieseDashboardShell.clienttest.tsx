import { fireEvent, render, screen } from "@testing-library/react";
import { SpielwieseDashboardShell } from "./SpielwieseDashboardShell";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";

describe("SpielwieseDashboardShell", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
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

    expect(screen.getByText("Spielwiese dashboard")).toBeTruthy();
    expect(screen.getByText("Shell content")).toBeTruthy();
    expect(screen.queryByText("langofuso")).toBeNull();
    expect(screen.queryByText("langfuse-redesign")).toBeNull();
    expect(
      container.querySelector("[data-testid='spielwiese-shell']"),
    ).toBeTruthy();
  });

  it("toggles the desktop left rail collapse state from the local shell", () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      addEventListener: jest.fn(),
      matches: query === "(min-width: 768px)",
      media: query,
      onchange: null,
      removeEventListener: jest.fn(),
    }));

    const shell = getSpielwieseShellVm();
    const dashboard = getSpielwieseDashboardVm();

    render(
      <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
        <div>Shell content</div>
      </SpielwieseDashboardShell>,
    );

    const shellRoot = screen.getByTestId("spielwiese-shell");
    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("false");

    fireEvent.click(screen.getByTestId("spielwiese-left-toggle"));

    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("true");
  });
});
