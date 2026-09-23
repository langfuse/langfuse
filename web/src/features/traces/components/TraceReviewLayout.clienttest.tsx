/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { TraceReviewLayout } from "./TraceReviewLayout";
import { TracePanelNavigationLayoutDesktop } from "./TracePanelNavigationLayoutDesktop/TracePanelNavigationLayoutDesktop";

const { navigationContext } = vi.hoisted(() => ({
  navigationContext: {
    isNavigationPanelCollapsed: false,
    handleTogglePanel: vi.fn(),
    shouldPulseToggle: false,
  },
}));

vi.mock("./TraceLayoutDesktop", () => ({
  useDesktopLayoutContext: () => navigationContext,
}));
vi.mock("./TracePanelNavigationHeader/TracePanelNavigationHeader", () => ({
  TracePanelNavigationHeader: () => <div />,
}));
vi.mock(
  "./TracePanelNavigationLayoutDesktop/components/TracePanelNavigationHiddenNotice",
  () => ({ TracePanelNavigationHiddenNotice: () => <div /> }),
);
vi.mock("./TraceTruncationNotice", () => ({
  TraceTruncationNotice: () => <div />,
}));

vi.mock("react-resizable-panels", () => ({
  useGroupRef: () => ({ current: { setLayout: vi.fn() } }),
  Group: ({
    children,
    orientation,
  }: {
    children: ReactNode;
    orientation: string;
  }) => (
    <div data-testid="group" data-orientation={orientation}>
      {children}
    </div>
  ),
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}));

function Harness({ open = true }: { open?: boolean }) {
  return (
    <div data-peek-content>
      <TraceReviewLayout
        open={open}
        review={<input aria-label="Review draft" />}
      >
        {({ collapsed, toggle }) => (
          <div>
            <button onClick={toggle}>
              {collapsed ? "Show navigation" : "Hide navigation"}
            </button>
            <input aria-label="Trace draft" />
          </div>
        )}
      </TraceReviewLayout>
    </div>
  );
}

let width = 1120;
function resize(viewport: number, container: number) {
  width = container;
  act(() => {
    window.innerWidth = viewport;
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  localStorage.clear();
  navigationContext.isNavigationPanelCollapsed = false;
  width = 1120;
  window.innerWidth = 1920;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      width,
      height: 800,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: width,
      toJSON() {},
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("trace review responsive workspace", () => {
  it("keeps the real navigator mounted with its editable state through collapse and reopening", () => {
    function NavigatorDraft() {
      const [draft, setDraft] = useState("");
      return (
        <input
          aria-label="Navigator draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      );
    }
    const renderNavigation = () => (
      <TracePanelNavigationLayoutDesktop>
        <NavigatorDraft />
      </TracePanelNavigationLayoutDesktop>
    );
    const view = render(renderNavigation());
    const draft = screen.getByLabelText("Navigator draft");
    fireEvent.change(draft, { target: { value: "Keep my navigation state" } });

    navigationContext.isNavigationPanelCollapsed = true;
    view.rerender(renderNavigation());
    expect(draft).toBeInTheDocument();
    expect(draft.closest("[inert]")).not.toBeNull();

    navigationContext.isNavigationPanelCollapsed = false;
    view.rerender(renderNavigation());
    expect(screen.getByLabelText("Navigator draft")).toBe(draft);
    expect(draft).toHaveValue("Keep my navigation state");
    expect(draft.closest("[inert]")).toBeNull();
  });

  it("uses available space automatically and retains both editors through reflow and close/reopen", () => {
    const view = render(<Harness />);
    const trace = screen.getByLabelText("Trace draft");
    const review = screen.getByLabelText("Review draft");
    fireEvent.change(trace, { target: { value: "trace edit" } });
    fireEvent.change(review, { target: { value: "unsent comment" } });
    expect(
      screen.getByRole("button", { name: "Hide navigation" }),
    ).toBeTruthy();
    expect(screen.getByTestId("group").getAttribute("data-orientation")).toBe(
      "horizontal",
    );

    resize(700, 700);
    expect(
      screen.getByRole("button", { name: "Show navigation" }),
    ).toBeTruthy();
    expect(screen.getByTestId("group").getAttribute("data-orientation")).toBe(
      "vertical",
    );
    resize(2560, 1280);
    expect(
      screen.getByRole("button", { name: "Hide navigation" }),
    ).toBeTruthy();
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness />);
    expect(screen.getByLabelText("Trace draft")).toBe(trace);
    expect(screen.getByLabelText("Review draft")).toBe(review);
    expect((review as HTMLInputElement).value).toBe("unsent comment");
    expect((trace as HTMLInputElement).value).toBe("trace edit");
  });

  it("keeps an explicit navigation choice across screen changes and later trace workspaces", () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Hide navigation" }));
    resize(2560, 1280);
    expect(
      screen.getByRole("button", { name: "Show navigation" }),
    ).toBeTruthy();
    view.unmount();
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "Show navigation" }),
    ).toBeTruthy();
    resize(700, 700);
    fireEvent.click(screen.getByRole("button", { name: "Show navigation" }));
    expect(
      screen.getByRole("button", { name: "Hide navigation" }),
    ).toBeTruthy();
    expect(screen.getByTestId("group").getAttribute("data-orientation")).toBe(
      "vertical",
    );
  });
});
