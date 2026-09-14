import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentBaselineControls } from "./ExperimentBaselineControls";
import { LAYER_ORDER } from "@/src/components/ui/layer";

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  onBaselineChange: vi.fn(),
  onBaselineClear: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => h.capture,
}));

// The rebuilt control groups its options by dataset and dates each run, so the
// options carry a dataset name and a start time.
vi.mock("@/src/features/experiments/hooks/useExperimentNames", () => ({
  useExperimentNames: () => ({
    experimentNames: [
      {
        experimentId: "exp-a",
        experimentName: "My Experiment A",
        datasetId: "ds-1",
        datasetName: "My Dataset One",
        startTime: new Date("2026-08-26T10:00:00Z"),
      },
      {
        experimentId: "exp-b",
        experimentName: "My Experiment B",
        datasetId: "ds-2",
        datasetName: "My Dataset Two",
        startTime: new Date("2026-08-25T10:00:00Z"),
      },
    ],
    isLoading: false,
  }),
}));

function installOverlayLayers() {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
}

describe("ExperimentBaselineControls analytics", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    h.capture.mockClear();
    h.onBaselineChange.mockClear();
    h.onBaselineClear.mockClear();
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("captures baseline_changed from the picker once, without the experiment name", () => {
    render(
      <ExperimentBaselineControls
        projectId="p1"
        baselineId="exp-a"
        baselineName="My Experiment A"
        onBaselineChange={h.onBaselineChange}
        onBaselineClear={h.onBaselineClear}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("My Experiment B"));

    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("experiment:baseline_changed", {
      isV4: true,
      tableName: "experiment-items",
      source: "picker",
    });
    expect(h.onBaselineChange).toHaveBeenCalledWith("exp-b");
    expect(JSON.stringify(h.capture.mock.calls[0][1])).not.toMatch(
      /My Experiment|exp-b/,
    );
  });

  it("captures baseline_changed from clear, and skips a no-op reselect", () => {
    render(
      <ExperimentBaselineControls
        projectId="p1"
        baselineId="exp-a"
        baselineName="My Experiment A"
        onBaselineChange={h.onBaselineChange}
        onBaselineClear={h.onBaselineClear}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    // Each option now carries a relative-date badge, so its accessible name is
    // the run name plus that badge rather than the name alone.
    fireEvent.click(screen.getByRole("option", { name: /My Experiment A/ }));
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.onBaselineChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear baseline" }));
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith("experiment:baseline_changed", {
      isV4: true,
      tableName: "experiment-items",
      source: "clear",
    });
    expect(h.onBaselineClear).toHaveBeenCalledTimes(1);
  });
});
