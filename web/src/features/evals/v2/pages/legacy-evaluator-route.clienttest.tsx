import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  evaluatorId: "legacy-evaluator",
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project-1", evaluatorId: mocks.evaluatorId },
  }),
}));

vi.mock("@/src/features/evals/components/evaluator-detail", () => ({
  EvaluatorDetail: () => <div>Legacy evaluator detail</div>,
}));

vi.mock("@/src/features/evals/v2/pages/evaluators", () => ({
  default: () => <div>Evaluator v2 overview</div>,
}));

import EvaluatorRoute from "@/src/pages/project/[projectId]/evals/[evaluatorId]";

describe("legacy evaluator route", () => {
  it("reserves the v2 segment for the evaluator v2 overview", () => {
    mocks.evaluatorId = "v2";

    render(<EvaluatorRoute />);

    expect(screen.getByText("Evaluator v2 overview")).toBeInTheDocument();
    expect(
      screen.queryByText("Legacy evaluator detail"),
    ).not.toBeInTheDocument();
  });

  it("continues to render legacy evaluator ids", () => {
    mocks.evaluatorId = "legacy-evaluator";

    render(<EvaluatorRoute />);

    expect(screen.getByText("Legacy evaluator detail")).toBeInTheDocument();
  });
});
