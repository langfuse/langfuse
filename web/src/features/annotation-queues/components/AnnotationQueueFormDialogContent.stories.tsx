import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

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
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormDialogContent
            mode="create"
            initialValues={{
              name: "",
              scoreConfigIds: ["config-1"],
              newAssignmentUserIds: [],
            }}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            queueNames={[]}
            onManageScoreConfigsClick={fn()}
            hasQueueAssignmentsReadAccess={false}
            isSubmitting={false}
            onSubmit={fn()}
            submitLabel="Create queue"
          />
        </DialogContent>
      </Dialog>
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await body.findByRole("combobox", { name: "Score configs" }),
    );

    await waitFor(() =>
      expect(
        body.getByPlaceholderText("Search score configs..."),
      ).toBeVisible(),
    );
  },
});

export const Edit = meta.story({
  name: "(Test) Edit with archived config",
  args: {
    mode: "edit",
    initialValues: {
      name: "Support review queue",
      description: "Weekly support trace review",
      scoreConfigIds: ["config-1", "config-2", "config-3"],
      newAssignmentUserIds: [],
    },
    scoreConfigs,
    projectId: "project-1",
    queueId: "queue-1",
    queueNames: ["Support review queue", "Other queue"],
    onManageScoreConfigsClick: fn(),
    hasQueueAssignmentsReadAccess: false,
    isSubmitting: false,
    onSubmit: fn(),
    submitLabel: "Save queue",
  },
  render: (args) => (
    <Dialog open onOpenChange={fn()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <AnnotationQueueFormDialogContent {...args} />
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const picker = await body.findByRole("combobox", { name: "Score configs" });
    await expect(picker).toHaveTextContent("Legacy quality");
    await userEvent.click(picker);
    await userEvent.click(
      body.getByRole("option", { name: /Legacy quality/, hidden: true }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(body.getByRole("button", { name: "Save queue" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ scoreConfigIds: ["config-1", "config-2"] }),
        expect.anything(),
      ),
    );
  },
});

export const Submitting = meta.story({
  render: () => {
    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormDialogContent
            mode="create"
            initialValues={{
              name: "New queue",
              scoreConfigIds: ["config-1"],
              newAssignmentUserIds: [],
            }}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            queueNames={[]}
            onManageScoreConfigsClick={fn()}
            hasQueueAssignmentsReadAccess={false}
            isSubmitting={true}
            onSubmit={fn()}
            submitLabel="Create queue"
          />
        </DialogContent>
      </Dialog>
    );
  },
});

export const WithAdvancedOpen = meta.story({
  render: () => {
    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormDialogContent
            mode="create"
            initialValues={{
              name: "Team queue",
              scoreConfigIds: ["config-1"],
              newAssignmentUserIds: ["user-1"],
            }}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            queueNames={[]}
            onManageScoreConfigsClick={fn()}
            hasQueueAssignmentsReadAccess={true}
            isSubmitting={false}
            onSubmit={fn()}
            submitLabel="Create queue"
          />
        </DialogContent>
      </Dialog>
    );
  },
});
