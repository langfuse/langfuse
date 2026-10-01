import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorAssistantScratchView } from "./EvaluatorAssistantScratchView";

const meta = preview.meta({ component: EvaluatorAssistantScratchView });

export const CodeEvaluator = meta.story({
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
});

export const JudgeEvaluator = meta.story({
  args: {
    evaluatorType: "LLM_AS_JUDGE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
});

export const Compact = meta.story({
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
});

export const Focused = meta.story({
  name: "(Test) Focused",
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("textbox", {
        name: "Describe the evaluator you want",
      }),
    );
  },
});

export const Loading = meta.story({
  name: "(Test) Loading",
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    let finishSubmission: (started: boolean) => void = () => undefined;
    args.onSubmit.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishSubmission = resolve;
        }),
    );
    const composer = canvas.getByRole("group", {
      name: "Evaluator request composer",
    });
    const input = within(composer).getByRole("textbox", {
      name: "Describe the evaluator you want",
    });
    const submit = within(composer).getByRole("button", {
      name: "Create evaluator",
    });

    await userEvent.type(input, "  Score whether the answer is helpful  ");
    await userEvent.keyboard("{Enter}");
    fireEvent.submit(input.closest("form")!);

    await expect(args.onSubmit).toHaveBeenCalledOnce();
    await expect(args.onSubmit).toHaveBeenCalledWith(
      "Score whether the answer is helpful",
    );
    await expect(submit).toBeDisabled();
    await expect(composer).toHaveAttribute("aria-busy", "true");
    await expect(input).toBeDisabled();
    await expect(
      canvas.getByRole("button", {
        name: "Fail when the answer contradicts the retrieved context",
      }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", {
        name: "Configure it manually instead",
      }),
    ).toBeDisabled();

    finishSubmission(true);
    await waitFor(() => {
      expect(input).toHaveValue("");
      expect(input).toBeEnabled();
      expect(composer).toHaveAttribute("aria-busy", "false");
    });
  },
});

export const ExampleSelection = meta.story({
  name: "(Test) Selects Example Without Submitting",
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const composer = canvas.getByRole("group", {
      name: "Evaluator request composer",
    });
    const examples = canvas.getByRole("region", {
      name: "Try one of these",
    });
    const input = within(composer).getByRole("textbox", {
      name: "Describe the evaluator you want",
    });
    const createButton = within(composer).getByRole("button", {
      name: "Create evaluator",
    });

    await expect(createButton).toBeDisabled();
    createButton.parentElement?.focus();
    await expect(await body.findByRole("tooltip")).toHaveTextContent(
      "Create evaluator",
    );
    await expect(composer.nextElementSibling).toBe(examples);
    await userEvent.click(
      within(examples).getByRole("button", {
        name: "Fail when the answer contradicts the retrieved context",
      }),
    );
    await expect(input).toHaveValue(
      "Fail when the answer contradicts the retrieved context",
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
});

export const ConfiguresManuallyWithoutSubmitting = meta.story({
  name: "(Test) Configures Manually Without Submitting",
  args: {
    evaluatorType: "CODE",
    onSubmit: fn(async () => true),
    onConfigureManually: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Configure it manually instead",
      }),
    );

    await expect(args.onConfigureManually).toHaveBeenCalledOnce();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
});
