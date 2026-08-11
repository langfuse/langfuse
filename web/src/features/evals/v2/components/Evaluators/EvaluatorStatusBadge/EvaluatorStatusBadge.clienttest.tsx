import { render, screen } from "@testing-library/react";

import { EvaluatorStatusBadge } from "./EvaluatorStatusBadge";

describe("EvaluatorStatusBadge", () => {
  it("shows blocked status before the active rule status", () => {
    render(<EvaluatorStatusBadge ruleCount={2} active blocked />);

    expect(screen.getByText("Blocked · 2")).toBeVisible();
    expect(screen.queryByText(/Active/)).not.toBeInTheDocument();
  });

  it("shows the total rule count independently of active status", () => {
    render(<EvaluatorStatusBadge ruleCount={3} active={false} />);

    expect(screen.getByText("Inactive · 3")).toBeVisible();
  });
});
