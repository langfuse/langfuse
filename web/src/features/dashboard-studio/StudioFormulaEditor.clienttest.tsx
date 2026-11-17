import { cleanup, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { StudioFormulaEditor } from "./StudioFormulaEditor";

beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe("formula field guidance", () => {
  it("uses the arithmetic parser for invalid syntax and accepts references to earlier formulas", () => {
    const props = {
      expression: { id: "ratio", label: "Ratio", formula: "a.count / (" },
      references: ["a.count", "earlier_formula"],
      onChange: () => {},
      onRemove: () => {},
    };
    const { rerender } = render(<StudioFormulaEditor {...props} />);
    expect(
      screen
        .getByRole("textbox", { name: /^Formula$/ })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Expected a value");
    rerender(
      <StudioFormulaEditor
        {...props}
        expression={{
          ...props.expression,
          formula: "earlier_formula / a.count",
        }}
      />,
    );
    expect(
      screen
        .getByRole("textbox", { name: /^Formula$/ })
        .getAttribute("aria-invalid"),
    ).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
