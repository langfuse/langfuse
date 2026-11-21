import { fireEvent, render, screen } from "@testing-library/react";
import { ChartLegend } from "./ChartLegend";

it("keeps every wrapping legend toggle directly available without an overflow menu", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  try {
    const onClick = vi.fn();
    render(
      <ChartLegend
        layout="wrap"
        items={["p50", "p90", "p95", "p99"].map((id) => ({
          id,
          label: `${id} observation latency`,
          color: "red",
          action: { label: `Hide ${id}`, pressed: true, onClick },
        }))}
      />,
    );
    for (const id of ["p50", "p90", "p95", "p99"])
      expect(screen.getByRole("button", { name: `Hide ${id}` })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide p99" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /additional series/ }),
    ).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});
