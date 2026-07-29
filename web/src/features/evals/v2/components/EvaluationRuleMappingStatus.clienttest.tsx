import { render, screen } from "@testing-library/react";

import { EvaluationRuleMappingStatus } from "./EvaluationRuleMappingStatus";

describe("EvaluationRuleMappingStatus", () => {
  it("distinguishes complete and incomplete variable mappings", () => {
    const { rerender } = render(
      <EvaluationRuleMappingStatus mappedCount={2} variableCount={2} />,
    );

    expect(screen.getByText("2/2 variables mapped")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByLabelText("All variables mapped")).toHaveClass(
      "text-dark-green",
    );

    rerender(<EvaluationRuleMappingStatus mappedCount={1} variableCount={2} />);

    expect(screen.getByText("1/2 variables mapped")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByLabelText("Some variables are not mapped")).toHaveClass(
      "text-dark-yellow",
    );
  });
});
