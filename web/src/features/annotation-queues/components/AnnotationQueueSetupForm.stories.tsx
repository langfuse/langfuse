import { type ComponentProps } from "react";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
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
      createAction={{ disabled: undefined, onClick: fn() }}
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

export const TestLegacyMetadata = meta.story({
  name: "(Test) Legacy Metadata Does Not Block Score Config Changes",
  args: {
    ...baseArgs,
    initialValues: {
      ...baseArgs.initialValues,
      name: "An API-created queue name longer than thirty-five characters",
      description: "<p>Legacy description</p>",
    },
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("tab", { name: "Annotation panel" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add score" }));
    await userEvent.click(body.getByRole("menuitem", { name: /^Feedback \(/ }));
    const save = canvas.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        {
          ...args.initialValues,
          scoreConfigIds: ["helpfulness", "accuracy", "feedback"],
        },
        {
          name: false,
          description: false,
          scoreConfigIds: true,
          newAssignmentUserIds: false,
        },
      ),
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Settings" }));
    const name = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.type(name, " too long");
    await expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, "Valid name");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Description (optional)" }),
      " edited",
    );
    await expect(save).toBeDisabled();
  },
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

export const TestTabsKeepDraft = meta.story({
  name: "(Test) Tabs Share Queue Setup Draft",
  args: { ...baseArgs, onSubmit: fn().mockResolvedValue(undefined) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const name = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Draft across tabs");
    await userEvent.click(
      canvas.getByRole("tab", { name: "Annotation panel" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add score" }));
    await userEvent.click(body.getByRole("menuitem", { name: /^Feedback \(/ }));
    await userEvent.click(canvas.getByRole("tab", { name: "Settings" }));
    await expect(canvas.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Draft across tabs",
    );
    await userEvent.click(
      canvas.getByRole("tab", { name: "Annotation panel" }),
    );
    await expect(canvas.getByText("Feedback", { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        {
          ...args.initialValues,
          name: "Draft across tabs",
          scoreConfigIds: ["helpfulness", "accuracy", "feedback"],
        },
        {
          name: true,
          description: false,
          scoreConfigIds: true,
          newAssignmentUserIds: false,
        },
      ),
    );
  },
});
