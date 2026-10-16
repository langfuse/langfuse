import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { AnnotationQueueScoreConfigEditor } from "./AnnotationQueueScoreConfigEditor";
import { type ComponentProps } from "react";
import { AnnotationQueueFormDialogContent } from "./AnnotationQueueFormDialogContent";

const scoreConfigs = [
  {
    id: "config-1",
    name: "Helpfulness",
    dataType: "NUMERIC",
    isArchived: false,
  },
  {
    id: "config-2",
    name: "Correctness",
    dataType: "BOOLEAN",
    isArchived: false,
  },
  {
    id: "config-3",
    name: "Legacy quality",
    dataType: "CATEGORICAL",
    isArchived: true,
  },
] satisfies Pick<
  ScoreConfigDomain,
  "id" | "name" | "dataType" | "isArchived"
>[];

const children: ComponentProps<
  typeof AnnotationQueueFormDialogContent
>["children"] = (control) => (
  <AnnotationQueueScoreConfigEditor
    {...control}
    scoreConfigs={scoreConfigs}
    createAction={{ disabled: undefined, onClick: fn() }}
    editAction={{ disabled: undefined, onClick: fn() }}
    warnOnRemoval={false}
    disabled={false}
  />
);

const meta = preview.meta({
  component: AnnotationQueueFormDialogContent,
  parameters: {
    layout: "fullscreen",
  },
});

export const Create = meta.story({
  name: "(Test) Create",
  render: () => {
    return (
      <DialogController<boolean>
        initialState={() => true}
        renderDialog={() => (
          <AnnotationQueueFormDialogContent
            mode="create"
            initialValues={{
              name: "",
              scoreConfigIds: ["config-1"],
              newAssignmentUserIds: [],
            }}
            projectId="project-1"
            queueNames={[]}
            hasQueueAssignmentsReadAccess={false}
            isSubmitting={false}
            onSubmit={fn()}
            submitLabel="Create queue"
          >
            {children}
          </AnnotationQueueFormDialogContent>
        )}
      >
        {() => null}
      </DialogController>
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(
      await body.findByRole("textbox", { name: "Name" }),
      "Review queue draft",
    );
    await userEvent.type(
      body.getByRole("textbox", { name: "Description (optional)" }),
      "Keep these review instructions",
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Add score" }),
    );
    await userEvent.type(
      await body.findByPlaceholderText("Search scores..."),
      "Correctness",
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: /Correctness/ }),
    );
    await expect(
      body.getByRole("list", { name: "Selected score configs" }),
    ).toHaveTextContent("Correctness");

    await userEvent.click(body.getByRole("button", { name: "Add score" }));
    await userEvent.type(
      await body.findByPlaceholderText("Search scores..."),
      "Another score",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(body.queryByRole("menu")).not.toBeInTheDocument();
      expect(body.getByRole("textbox", { name: "Name" })).toHaveValue(
        "Review queue draft",
      );
      expect(
        body.getByRole("textbox", { name: "Description (optional)" }),
      ).toHaveValue("Keep these review instructions");
      expect(
        body.getByRole("list", { name: "Selected score configs" }),
      ).toHaveTextContent("Correctness");
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});

export const Edit = meta.story({
  name: "(Test) Queue settings preserve score configs",
  args: {
    mode: "edit",
    initialValues: {
      name: "Support review queue",
      description: "Weekly support trace review",
      scoreConfigIds: ["config-1", "config-2", "config-3"],
      newAssignmentUserIds: [],
    },
    children,
    projectId: "project-1",
    queueId: "queue-1",
    queueNames: ["Support review queue", "Other queue"],
    hasQueueAssignmentsReadAccess: false,
    isSubmitting: false,
    onSubmit: fn(),
    submitLabel: "Save queue",
  },
  render: (args) => (
    <DialogController<boolean>
      initialState={() => true}
      renderDialog={() => <AnnotationQueueFormDialogContent {...args} />}
    >
      {() => null}
    </DialogController>
  ),
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.queryByRole("button", { name: "Add score" }),
    ).not.toBeInTheDocument();
    await userEvent.clear(body.getByRole("textbox", { name: "Name" }));
    await userEvent.type(
      body.getByRole("textbox", { name: "Name" }),
      "Renamed queue",
    );
    await userEvent.click(body.getByRole("button", { name: "Save queue" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Renamed queue",
          scoreConfigIds: ["config-1", "config-2", "config-3"],
        }),
        expect.anything(),
      ),
    );
  },
});

export const Submitting = meta.story({
  render: () => {
    return (
      <DialogController<boolean>
        initialState={() => true}
        renderDialog={() => (
          <AnnotationQueueFormDialogContent
            mode="create"
            initialValues={{
              name: "New queue",
              scoreConfigIds: ["config-1"],
              newAssignmentUserIds: [],
            }}
            projectId="project-1"
            queueNames={[]}
            hasQueueAssignmentsReadAccess={false}
            isSubmitting={true}
            onSubmit={fn()}
            submitLabel="Create queue"
          >
            {children}
          </AnnotationQueueFormDialogContent>
        )}
      >
        {() => null}
      </DialogController>
    );
  },
});

export const WithAdvancedOpen = meta.story({
  render: () => {
    return (
      <DialogController<boolean>
        initialState={() => true}
        renderDialog={() => (
          <AnnotationQueueFormDialogContent
            mode="create"
            initialValues={{
              name: "Team queue",
              scoreConfigIds: ["config-1"],
              newAssignmentUserIds: ["user-1"],
            }}
            projectId="project-1"
            queueNames={[]}
            hasQueueAssignmentsReadAccess={true}
            isSubmitting={false}
            onSubmit={fn()}
            submitLabel="Create queue"
          >
            {children}
          </AnnotationQueueFormDialogContent>
        )}
      >
        {() => null}
      </DialogController>
    );
  },
});
