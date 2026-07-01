import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chart } from "@/src/features/widgets/chart-library/Chart";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const addPopoverLayer = () => {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  const popoverLayer = document.createElement("div");
  popoverLayer.setAttribute("data-layer", "popover");
  overlayRoot.appendChild(popoverLayer);
  document.body.appendChild(overlayRoot);
};

describe("Chart drilldown menu", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    addPopoverLayer();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
    vi.unstubAllGlobals();
  });

  it("opens a View traces action before navigating", async () => {
    const onDrilldown = vi.fn();

    render(
      <Chart
        chartType="NUMBER"
        data={[
          {
            time_dimension: undefined,
            dimension: undefined,
            metric: 42,
            drilldown: { href: "/project/project-1/traces?filter=encoded" },
          },
        ]}
        rowLimit={100}
        onDrilldown={onDrilldown}
      />,
    );

    const number = screen.getByText("42").closest("[role='button']");
    expect(number).toBeTruthy();

    fireEvent.click(number!, { clientX: 120, clientY: 80 });

    const viewTraces = await screen.findByRole("button", {
      name: "View traces",
    });
    expect(onDrilldown).not.toHaveBeenCalled();

    fireEvent.click(viewTraces);

    expect(onDrilldown).toHaveBeenCalledWith(
      "/project/project-1/traces?filter=encoded",
    );
  });
});
