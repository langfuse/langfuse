import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { AnnotationQueueScoreConfigEditor } from "./AnnotationQueueScoreConfigEditor";
import { AnnotationQueueScoreConfigsDialogContent } from "./AnnotationQueueScoreConfigsDialogContent";

const meta = preview.meta({
  component: AnnotationQueueScoreConfigsDialogContent,
});

export const SaveOrderedSelection = meta.story({
  name: "(Test) Save reordered selection after adding multiple configs",
  args: {
    initialValue: ["accuracy", "quality"],
    isSubmitting: false,
    onSubmit: fn(),
    children: (control) => (
      <AnnotationQueueScoreConfigEditor
        {...control}
        scoreConfigs={[
          {
            id: "accuracy",
            name: "Accuracy",
            dataType: "BOOLEAN",
            isArchived: false,
          },
          {
            id: "quality",
            name: "Quality",
            dataType: "NUMERIC",
            isArchived: false,
          },
          {
            id: "feedback",
            name: "Feedback",
            dataType: "TEXT",
            isArchived: false,
          },
          {
            id: "safety",
            name: "Safety",
            dataType: "BOOLEAN",
            isArchived: false,
          },
        ]}
        createAction={<Button text="Create score config" onClick={fn()} />}
        editAction={{ disabled: undefined, onClick: fn() }}
        disabled={false}
        warnOnRemoval={false}
      />
    ),
  },
  render: (args) => (
    <DialogController<boolean>
      initialState={() => true}
      renderDialog={() => (
        <AnnotationQueueScoreConfigsDialogContent {...args} />
      )}
    >
      {() => null}
    </DialogController>
  ),
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      body.getByRole("combobox", { name: "Select score configs" }),
    );
    await userEvent.click(body.getByRole("option", { name: /^Feedback/ }));
    await userEvent.click(body.getByRole("option", { name: /^Safety/ }));
    await userEvent.keyboard("{Escape}");
    body.getByRole("button", { name: "Reorder Quality" }).focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard(" ");
    await userEvent.click(
      body.getByRole("button", { name: "Save score configs" }),
    );
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith([
        "quality",
        "accuracy",
        "feedback",
        "safety",
      ]),
    );
  },
});
