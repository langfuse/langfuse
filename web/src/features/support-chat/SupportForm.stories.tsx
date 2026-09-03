import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { SEVERITY_1, SEVERITY_3 } from "./formConstants";
import { SupportForm } from "./SupportForm";

const defaultArgs = {
  canSelectHighSeverity: false,
  initialTopic: "",
  showV4MigrationTopic: false,
  onCancel: fn(),
  onSuccess: fn(),
  onSubmit: fn(async () => "success" as const),
  onFileError: fn(),
} satisfies ComponentProps<typeof SupportForm>;

const LONG_MESSAGE =
  "I need help understanding why my traces are missing spans after the latest deploy.";

const meta = preview.meta({
  component: SupportForm,
});

export const Default = meta.story({
  args: defaultArgs,
});

export const Enterprise = meta.story({
  args: {
    ...defaultArgs,
    canSelectHighSeverity: true,
  },
});

export const WithInitialTopic = meta.story({
  args: {
    ...defaultArgs,
    initialTopic: "Observability",
  },
});

export const WithV4MigrationTopic = meta.story({
  args: {
    ...defaultArgs,
    showV4MigrationTopic: true,
  },
});

async function selectTopic(canvasElement: HTMLElement, topic: string) {
  const body = within(canvasElement.ownerDocument.body);
  const comboboxes = body.getAllByRole("combobox");
  await userEvent.click(comboboxes[1]!);
  await userEvent.click(await body.findByRole("option", { name: topic }));
}

function getMessageField(canvasElement: HTMLElement) {
  return within(canvasElement).getByPlaceholderText(
    /Please explain as fully as possible/,
  );
}

export const WarnsOnShortMessage = meta.story({
  name: "(Test) Warns on short message",
  args: defaultArgs,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await selectTopic(canvasElement, "Observability");
    await userEvent.type(getMessageField(canvasElement), "Too short");
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));

    await expect(canvas.getByText(/The message seems short/i)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Submit Anyways" }),
    ).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
});

export const SubmitsRequest = meta.story({
  name: "(Test) Submits request",
  args: {
    ...defaultArgs,
    onSubmit: fn(async () => "success" as const),
    onSuccess: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await selectTopic(canvasElement, "Observability");
    await userEvent.type(getMessageField(canvasElement), LONG_MESSAGE);
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));

    await expect(args.onSubmit).toHaveBeenCalledWith(
      {
        messageType: "Question",
        severity: SEVERITY_3,
        topic: "Observability",
        message: LONG_MESSAGE,
        integrationType: "",
      },
      [],
    );
    await expect(args.onSuccess).toHaveBeenCalled();
  },
});

export const ConfirmsSeverity1 = meta.story({
  name: "(Test) Confirms severity 1",
  args: {
    ...defaultArgs,
    canSelectHighSeverity: true,
    onSubmit: fn(async () => "success" as const),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getAllByRole("combobox")[0]!);
    await userEvent.click(
      await body.findByRole("option", { name: SEVERITY_1 }),
    );

    await selectTopic(canvasElement, "Observability");
    await userEvent.type(getMessageField(canvasElement), LONG_MESSAGE);
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));

    const confirmTitle = await body.findByRole("heading", {
      name: "Confirm Severity 1 (Critical Business Impact)",
    });
    await expect(confirmTitle).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();

    await userEvent.click(
      await body.findByRole("button", { name: "Confirm & Submit" }),
    );

    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: SEVERITY_1,
        topic: "Observability",
        message: LONG_MESSAGE,
      }),
      [],
    );
  },
});

export const KeepsFormWhenSubmitIsKept = meta.story({
  name: "(Test) Keeps form when submit is kept",
  args: {
    ...defaultArgs,
    initialTopic: "Observability",
    onSubmit: fn(async () => "kept" as const),
    onSuccess: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.type(getMessageField(canvasElement), LONG_MESSAGE);
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));

    await expect(args.onSubmit).toHaveBeenCalled();
    await expect(args.onSuccess).not.toHaveBeenCalled();
    await expect(getMessageField(canvasElement)).toHaveValue(LONG_MESSAGE);
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
});
