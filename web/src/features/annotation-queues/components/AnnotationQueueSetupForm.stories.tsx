import { type ComponentProps } from "react";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { AnnotationQueueScoreConfigEditor } from "./AnnotationQueueScoreConfigEditor";
import { AnnotationQueueSetupForm } from "./AnnotationQueueSetupForm";

type SetupProps = ComponentProps<typeof AnnotationQueueSetupForm>;
const configs: ComponentProps<
  typeof AnnotationQueueScoreConfigEditor
>["scoreConfigs"] = [
  { id: "accuracy", name: "Accuracy", dataType: "NUMERIC", isArchived: false },
  {
    id: "helpfulness",
    name: "Helpfulness",
    dataType: "BOOLEAN",
    isArchived: false,
  },
  { id: "feedback", name: "Feedback", dataType: "TEXT", isArchived: false },
];

const baseArgs: SetupProps = {
  initialValues: {
    name: "Review queue",
    description: "Review response quality.",
    scoreConfigIds: ["helpfulness", "accuracy"],
    newAssignmentUserIds: [],
  },
  queueNames: ["Another queue"],
  canEdit: true,
  isSubmitting: false,
  hasAssignments: false,
  onSubmit: fn().mockResolvedValue(undefined),
  renderLayout: (content) => (
    <div className="bg-background h-[640px] w-[380px] max-w-full border">
      {content}
    </div>
  ),
  renderAssignments: () => null,
  children: ({ value, onChange, disabled }) => (
    <AnnotationQueueScoreConfigEditor
      scoreConfigs={configs}
      value={value}
      onChange={onChange}
      disabled={disabled}
      warnOnRemoval={false}
      createAction={
        <Button
          text="Create score config"
          variant="secondary"
          disabled={disabled}
          onClick={fn()}
        />
      }
      editAction={{ disabled: undefined, onClick: fn() }}
    />
  ),
};

const meta = preview.meta({ component: AnnotationQueueSetupForm });

export const Default = meta.story({ args: baseArgs });

export const NoScoreConfigs = meta.story({
  args: {
    ...baseArgs,
    initialValues: { ...baseArgs.initialValues, scoreConfigIds: [] },
  },
});

export const Saving = meta.story({
  args: { ...baseArgs, isSubmitting: true },
});

export const TestSaveAndDiscard = meta.story({
  name: "(Test) Save and Discard Queue Setup",
  args: { ...baseArgs, onSubmit: fn().mockResolvedValue(undefined) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Name" });
    const save = canvas.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, "Draft queue");
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));
    await expect(name).toHaveValue("Review queue");
    await expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, "Saved queue");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        { ...args.initialValues, name: "Saved queue" },
        {
          name: true,
          description: false,
          scoreConfigIds: false,
          newAssignmentUserIds: false,
        },
      ),
    );
    await expect(name).toHaveValue("Saved queue");
    await waitFor(() => expect(save).toBeDisabled());
  },
});

export const TestFailedSaveKeepsDraft = meta.story({
  name: "(Test) Failed Save Keeps Queue Setup Draft",
  args: {
    ...baseArgs,
    onSubmit: fn(),
  },
  play: async ({ args, canvasElement }) => {
    mocked(args.onSubmit).mockRejectedValueOnce(new Error("Save failed"));
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Unsaved queue");
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalled());
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Your changes are still here.",
    );
    await expect(name).toHaveValue("Unsaved queue");
    await expect(
      canvas.getByRole("button", { name: "Save changes" }),
    ).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));
    await expect(name).toHaveValue("Review queue");
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
});
