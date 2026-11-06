import { render, screen } from "@testing-library/react";
import { useVerticalBarChart } from "./useVerticalBarChart";
import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";

function CompactBarChart() {
  const { visualization } = useVerticalBarChart({
    data: [
      { time_dimension: undefined, dimension: "negative", metric: -1 },
      { time_dimension: undefined, dimension: "positive", metric: 1 },
    ],
    zeroBaseline: true,
    hideXAxisLabels: true,
  });
  return <VisualizationFrame content={visualization} />;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders a compact bar chart whose values cross zero", () => {
  const bounds = new DOMRect(0, 0, 500, 63);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.id === "recharts_measurement_span"
        ? new DOMRect(0, 0, 8, 12)
        : bounds;
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: bounds } as ResizeObserverEntry],
          this,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  const { container } = render(<CompactBarChart />);
  expect(container.querySelectorAll('[role="graphics-symbol"]')).toHaveLength(
    2,
  );
  expect(container.querySelector("[data-zero-baseline]")).toHaveAttribute(
    "stroke-width",
    "1.5",
  );
  expect(screen.getByText("0")).toBeInTheDocument();
});
