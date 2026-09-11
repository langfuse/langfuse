import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EvaluatorAssistantScratchView } from "./EvaluatorAssistantScratchView";

describe("EvaluatorAssistantScratchView", () => {
  it("uses an example as the evaluator request and submits once", async () => {
    let finishSubmission: (started: boolean) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSubmission = resolve;
        }),
    );

    render(
      <EvaluatorAssistantScratchView
        evaluatorType="CODE"
        onSubmit={onSubmit}
        onConfigureManually={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Fail when the answer contradicts the retrieved context",
      }),
    );
    const input = screen.getByLabelText("Describe the evaluator you want");
    expect(input).toHaveValue(
      "Fail when the answer contradicts the retrieved context",
    );

    const form = input.closest("form");
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      "Fail when the answer contradicts the retrieved context",
    );
    expect(
      screen.getByRole("button", { name: "Create evaluator" }),
    ).toBeDisabled();

    finishSubmission(true);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("hands off to manual configuration without submitting", () => {
    const onSubmit = vi.fn();
    const onConfigureManually = vi.fn();

    render(
      <EvaluatorAssistantScratchView
        evaluatorType="LLM_AS_JUDGE"
        onSubmit={onSubmit}
        onConfigureManually={onConfigureManually}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Configure it manually instead",
      }),
    );

    expect(onConfigureManually).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
