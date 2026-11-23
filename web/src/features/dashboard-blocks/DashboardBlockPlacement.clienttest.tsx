import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { DashboardBlockPlacement } from "./DashboardBlockPlacement";

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

it("keeps the end position distinct from arbitrary placement IDs without empty select items", () => {
  const onChange = vi.fn();
  const options = [
    { value: null, label: "After all chart rows" },
    { value: "", label: "Before the empty ID" },
    { value: '["after"]', label: "Before the sentinel-like ID" },
  ];
  const placement = (value: string | null) => (
    <LayerProvider>
      <DashboardBlockPlacement
        value={value}
        options={options}
        disabled={false}
        onChange={onChange}
      />
    </LayerProvider>
  );
  const view = render(placement(null));
  expect(
    screen.queryByRole("combobox", { name: "Position" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Position:/ }));
  fireEvent.click(screen.getByRole("combobox", { name: "Position" }));
  fireEvent.click(screen.getByRole("option", { name: "Before the empty ID" }));
  expect(onChange).toHaveBeenLastCalledWith("");
  view.rerender(placement(""));
  fireEvent.click(screen.getByRole("combobox", { name: "Position" }));
  fireEvent.click(
    screen.getByRole("option", { name: "Before the sentinel-like ID" }),
  );
  expect(onChange).toHaveBeenLastCalledWith('["after"]');
  view.rerender(placement('["after"]'));
  fireEvent.click(screen.getByRole("combobox", { name: "Position" }));
  fireEvent.click(screen.getByRole("option", { name: "After all chart rows" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
});
