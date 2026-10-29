import { cleanup, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExperimentResultsPage from "./ExperimentResultsPage";

const h = vi.hoisted(() => ({
  ids: ["baseline", "candidate"],
  layout: "grid",
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: "project" }, replace: vi.fn() }),
}));
vi.mock("@/src/utils/api", () => ({
  api: { experiments: { byId: { useQuery: () => ({ data: undefined }) } } },
}));
vi.mock("@/src/components/layouts/Page", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/src/components/layouts/overview-panel", () => ({
  OverviewPanelLayout: ({ mainContent }: { mainContent: ReactNode }) => (
    <main>{mainContent}</main>
  ),
  OverviewPanelToggle: () => <button>Details</button>,
}));
vi.mock("@/src/features/experiments/hooks/useExperimentAccess", () => ({
  useExperimentAccess: () => ({
    isExperimentsBetaActive: true,
    isInitializing: false,
  }),
}));
vi.mock("@/src/features/experiments/hooks/useExperimentResultsState", () => ({
  useExperimentResultsState: () => ({
    baselineId: h.ids[0],
    hasBaseline: h.ids.length > 0,
    comparisonIds: h.ids.slice(1),
    allExperimentIds: h.ids,
    colorExperimentIds: h.ids,
    layout: h.layout,
    diffMode: "comparison",
    itemVisibility: "baseline-only",
  }),
}));
vi.mock("@/src/features/experiments/components/ExperimentScoreSummary", () => ({
  ExperimentScoreSummary: ({
    projectId,
    experimentIds,
    baselineId,
  }: {
    projectId: string;
    experimentIds: string[];
    baselineId?: string;
  }) => (
    <div data-testid="run-scores">
      {projectId}:{baselineId}:{experimentIds.join(",")}
    </div>
  ),
}));
vi.mock("@/src/features/experiments/components/table", () => ({
  ExperimentItemsTable: ({
    toolbarSettings,
  }: {
    toolbarSettings: ReactNode;
  }) => <div data-testid="items">{toolbarSettings}Items</div>,
}));
vi.mock(
  "@/src/features/experiments/components/ExperimentSelectionControls",
  () => ({ ExperimentSelectionControls: () => <div>Selection</div> }),
);
vi.mock(
  "@/src/features/experiments/components/ExperimentDisplaySettings",
  () => ({ ExperimentDisplaySettings: () => <div>Item display</div> }),
);
vi.mock(
  "@/src/features/experiments/components/ExperimentOverviewPanel",
  () => ({ ExperimentOverviewPanel: () => <div>Overview</div> }),
);
vi.mock("@/src/components/table/data-table-io-render-mode-switch", () => ({
  useIoRenderModeLocalStorage: () => ["json", vi.fn()],
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

describe("ExperimentResultsPage run-score summary", () => {
  beforeEach(() => {
    h.ids = ["baseline", "candidate"];
    h.layout = "grid";
  });
  afterEach(cleanup);

  it.each(["grid", "list", "matrix"])(
    "keeps the run summary above the items in the %s layout",
    (layout) => {
      h.layout = layout;
      render(<ExperimentResultsPage />);
      const summary = screen.getByTestId("run-scores");
      expect(summary).toHaveTextContent("project:baseline:baseline,candidate");
      expect(summary.compareDocumentPosition(screen.getByTestId("items"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(screen.getByText("Item display")).toBeInTheDocument();
    },
  );

  it("does not mount the summary without selected experiments", () => {
    h.ids = [];
    render(<ExperimentResultsPage />);
    expect(screen.queryByTestId("run-scores")).not.toBeInTheDocument();
    expect(screen.getByTestId("items")).toBeInTheDocument();
  });
});
