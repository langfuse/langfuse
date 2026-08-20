import { render, screen } from "@testing-library/react";
import { type FilterState } from "@langfuse/shared";
import { EvaluatorFilterCell } from "@/src/features/evals/components/EvaluatorFilterCell";

const ENVIRONMENT_FILTER = [
  {
    type: "stringOptions",
    column: "environment",
    operator: "any of",
    value: ["prod"],
  },
] satisfies FilterState;

const LONG_NAME_FILTER = [
  {
    type: "stringOptions",
    column: "Name",
    operator: "any of",
    value: ["Chat about billing and account recovery"],
  },
] satisfies FilterState;

describe("EvaluatorFilterCell", () => {
  it("does not enable a per-cell horizontal scrollbar", () => {
    const { container } = render(
      <EvaluatorFilterCell filterState={ENVIRONMENT_FILTER} />,
    );

    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    expect(container.firstElementChild).toHaveClass("overflow-hidden");
  });

  it("renders the filter pill and exposes the full value on hover", () => {
    render(<EvaluatorFilterCell filterState={LONG_NAME_FILTER} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(
      screen.getByTitle("Name any of Chat about billing and account recovery"),
    ).toBeInTheDocument();
  });
});
