import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { FilterArrayValueSelect } from "./filter-array-value-select";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

describe("FilterArrayValueSelect", () => {
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

  const Harness = () => {
    const [values, setValues] = useState<string[]>([]);
    return (
      <FilterArrayValueSelect
        title="Value"
        values={values}
        onValueChange={setValues}
        options={[{ value: "latest" }, { value: "production" }]}
      />
    );
  };

  const open = () => fireEvent.click(screen.getByRole("button"));

  it("adds multiple custom values via the tag create row", () => {
    render(<Harness />);
    open();

    fireEvent.change(screen.getByPlaceholderText("Value"), {
      target: { value: "staging" },
    });
    fireEvent.click(screen.getByText(/Create new tag: "staging"/i));
    expect(
      screen.getByRole("button", { name: /staging/i }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Value"), {
      target: { value: "nightly" },
    });
    fireEvent.click(screen.getByText(/Create new tag: "nightly"/i));
    expect(
      screen.getAllByRole("button", { name: /nightly/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /staging/i }).length,
    ).toBeGreaterThan(0);
  });
});
