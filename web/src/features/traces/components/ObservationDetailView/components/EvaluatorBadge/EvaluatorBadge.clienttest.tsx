// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";

import { EvaluatorBadge } from "./EvaluatorBadge";

describe("EvaluatorBadge", () => {
  it("links evaluator executions to the named evaluator", () => {
    render(
      <EvaluatorBadge
        evaluatorId="evaluator-id"
        evaluatorName="Quality check"
        environment={LangfuseInternalTraceEnvironment.LLMJudge}
        projectId="project"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Evaluator: Quality check",
    });
    expect(link).toHaveAttribute(
      "href",
      "/project/project/evals/v2/evaluator-id",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("ph-no-capture");
    expect(
      screen.getByText("Evaluator: Quality check").parentElement,
    ).toHaveClass("bg-tertiary");
  });

  it("falls back to a generic label when the evaluator name is unavailable", () => {
    render(
      <EvaluatorBadge
        evaluatorId="evaluator-id"
        environment={LangfuseInternalTraceEnvironment.CodeEval}
        projectId="project"
      />,
    );

    expect(screen.getByRole("link", { name: "Evaluator" })).toBeInTheDocument();
  });

  it("hides links for non-evaluator executions and managed templates", () => {
    render(
      <>
        <EvaluatorBadge
          evaluatorId="user-metadata"
          environment="production"
          projectId="project"
        />
        <EvaluatorBadge
          evaluatorId="managed:exact-match"
          environment={LangfuseInternalTraceEnvironment.CodeEval}
          projectId="project"
        />
      </>,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
