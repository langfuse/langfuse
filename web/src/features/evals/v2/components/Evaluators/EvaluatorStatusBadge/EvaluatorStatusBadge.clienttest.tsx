import { render, screen } from "@testing-library/react";

import { EvaluatorStatusBadge } from "./EvaluatorStatusBadge";

describe("EvaluatorStatusBadge", () => {
  it("shows blocked status before the active rule status", () => {
    render(<EvaluatorStatusBadge activeRuleCount={2} blocked />);

    expect(screen.getByText("Blocked · 2")).toBeVisible();
    expect(screen.queryByText(/Active/)).not.toBeInTheDocument();
  });
});
