import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { DashboardBlocksAddMenu } from "./DashboardBlocksAddMenu";
import {
  DashboardBlocksContext,
  type DashboardBlocksContextValue,
} from "./dashboard-block-context";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const context: DashboardBlocksContextValue = {
  projectId: "project",
  dashboardId: "dashboard",
  canEdit: true,
  readPath: "v4",
  dateRange: undefined,
  filterState: [],
  capabilitiesPending: false,
  capabilities: { multiQuery: false, markdown: false },
  blocks: [],
  widgets: [],
  placementOptions: [],
  loadError: false,
  openEditor: vi.fn(),
  track: vi.fn(),
};

describe("dashboard block creation capabilities", () => {
  it.each([
    { multiQuery: false, markdown: false },
    { multiQuery: false, markdown: true },
    { multiQuery: true, markdown: false },
    { multiQuery: true, markdown: true },
  ])("keeps the kinds independent: %j", (capabilities) => {
    const onExistingWidget = vi.fn();
    const openEditor = vi.fn();
    const view = render(
      <LayerProvider>
        <DashboardBlocksContext.Provider
          value={{ ...context, capabilities, openEditor }}
        >
          <DashboardBlocksAddMenu onExistingWidget={onExistingWidget} />
        </DashboardBlocksContext.Provider>
      </LayerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }));
    if (!capabilities.multiQuery && !capabilities.markdown) {
      expect(onExistingWidget).toHaveBeenCalledOnce();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    } else {
      expect(
        Boolean(
          screen.queryByRole("menuitem", { name: /New multi-query chart/ }),
        ),
      ).toBe(capabilities.multiQuery);
      expect(
        Boolean(screen.queryByRole("menuitem", { name: /Markdown/ })),
      ).toBe(capabilities.markdown);
      fireEvent.click(
        screen.getByRole("menuitem", {
          name: /Existing widgets and home cards/,
        }),
      );
      expect(onExistingWidget).toHaveBeenCalledOnce();
      expect(openEditor).not.toHaveBeenCalled();
    }
    view.unmount();
  });
});

it("does not open the classic chooser while initial capabilities are unresolved", () => {
  const onExistingWidget = vi.fn();
  render(
    <LayerProvider>
      <DashboardBlocksContext.Provider
        value={{ ...context, capabilitiesPending: true }}
      >
        <DashboardBlocksAddMenu onExistingWidget={onExistingWidget} />
      </DashboardBlocksContext.Provider>
    </LayerProvider>,
  );
  const button = screen.getByRole("button", { name: "Add widget" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onExistingWidget).not.toHaveBeenCalled();
});
