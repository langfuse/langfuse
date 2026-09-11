import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EvaluatorAssistantScratchView } from "./EvaluatorAssistantScratchView";

describe("EvaluatorAssistantScratchView", () => {
  it("keeps the icon submit accessible and examples below the composer", async () => {
    const onSubmit = vi.fn();

    render(
      <EvaluatorAssistantScratchView
        evaluatorType="CODE"
        onSubmit={onSubmit}
        onConfigureManually={vi.fn()}
      />,
    );

    const composer = screen.getByRole("group", {
      name: "Evaluator request composer",
    });
    const examples = screen.getByRole("region", {
      name: "Try one of these",
    });
    const input = within(composer).getByRole("textbox", {
      name: "Describe the evaluator you want",
    });

    const createButton = within(composer).getByRole("button", {
      name: "Create evaluator",
    });
    expect(createButton).toBeDisabled();
    fireEvent.focus(createButton.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Create evaluator",
    );
    expect(
      composer.compareDocumentPosition(examples) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(
      within(examples).getByRole("button", {
        name: "Fail when the answer contradicts the retrieved context",
      }),
    );

    expect(input).toHaveValue(
      "Fail when the answer contradicts the retrieved context",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits with Enter and blocks duplicate submissions while pending", async () => {
    let finishSubmission: (started: boolean) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSubmission = resolve;
        }),
    );

    render(
      <EvaluatorAssistantScratchView
        evaluatorType="LLM_AS_JUDGE"
        onSubmit={onSubmit}
        onConfigureManually={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Describe the evaluator you want");
    fireEvent.change(input, {
      target: { value: "  Score whether the answer is helpful  " },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.submit(input.closest("form")!);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      "Score whether the answer is helpful",
    );
    expect(
      screen.getByRole("button", { name: "Create evaluator" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Fail when the answer contradicts the retrieved context",
      }),
    ).toBeDisabled();

    finishSubmission(true);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("hands off to manual configuration without submitting", () => {
    const onSubmit = vi.fn();
    const onConfigureManually = vi.fn();

    render(
      <EvaluatorAssistantScratchView
        evaluatorType="CODE"
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
