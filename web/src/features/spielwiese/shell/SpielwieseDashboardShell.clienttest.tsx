import { fireEvent, render, screen } from "@testing-library/react";
import { SpielwieseDashboardShell } from "./SpielwieseDashboardShell";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";

function createMatchMedia(matches: boolean) {
  return jest.fn().mockImplementation((query: string) => ({
    addEventListener: jest.fn(),
    matches,
    media: query,
    onchange: null,
    removeEventListener: jest.fn(),
  }));
}

function renderShell() {
  const shell = getSpielwieseShellVm();
  const dashboard = getSpielwieseDashboardVm();

  render(
    <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
      <div>Shell content</div>
    </SpielwieseDashboardShell>,
  );
}

const originalMatchMedia = window.matchMedia;

describe("SpielwieseDashboardShell render", () => {
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

    expect(screen.getAllByText("Macroextractor").length >= 1).toBeTruthy();
    expect(screen.getByText("Macroextractor / Assistant")).toBeTruthy();
    expect(screen.getByText("Shell content")).toBeTruthy();
    expect(screen.queryByText("langofuso")).toBeNull();
    expect(screen.queryByText("langfuse-redesign")).toBeNull();
    expect(
      container.querySelector("[data-testid='spielwiese-shell']"),
    ).toBeTruthy();
    expect(screen.getByTestId("spielwiese-shell-header")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-shell-body")).toBeTruthy();
    expect(
      screen
        .getByTestId("spielwiese-shell-header")
        .compareDocumentPosition(screen.getByTestId("spielwiese-shell-body")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("SpielwieseDashboardShell interactions", () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("toggles the desktop left rail collapse state from the local shell", () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      addEventListener: jest.fn(),
      matches: query === "(min-width: 768px)",
      media: query,
      onchange: null,
      removeEventListener: jest.fn(),
    }));

    renderShell();

    const shellRoot = screen.getByTestId("spielwiese-shell");
    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("false");

    fireEvent.click(screen.getByTestId("spielwiese-left-toggle"));

    expect(shellRoot.getAttribute("data-left-collapsed")).toBe("true");
  });

  it("opens mobile drawers below the sticky header", () => {
    window.matchMedia = createMatchMedia(false);

    renderShell();

    fireEvent.click(screen.getByTestId("spielwiese-left-toggle"));

    expect(screen.getByTestId("spielwiese-mobile-backdrop")).toBeTruthy();
    expect(
      screen
        .getByTestId("spielwiese-mobile-left-drawer")
        .className.includes("top-[var(--spielwiese-shell-offset)]"),
    ).toBe(true);

    fireEvent.click(screen.getByTestId("spielwiese-mobile-backdrop"));
    fireEvent.click(screen.getByTestId("spielwiese-right-toggle"));

    expect(
      screen
        .getByTestId("spielwiese-mobile-right-drawer")
        .className.includes("top-[var(--spielwiese-shell-offset)]"),
    ).toBe(true);
    expect(screen.getByTestId("spielwiese-mobile-backdrop")).toBeTruthy();
  });
});
