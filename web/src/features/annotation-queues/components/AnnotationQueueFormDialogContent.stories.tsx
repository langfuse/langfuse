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
      await body.findByRole("button", { name: /Select.*Helpfulness/ }),
    );

    await waitFor(() =>
      expect(body.getByPlaceholderText("Value")).toBeVisible(),
    );
  },
});

export const Edit = meta.story({
  render: () => {
    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormDialogContent
            mode="edit"
            initialValues={{
              name: "Support review queue",
              description: "Weekly support trace review",
              scoreConfigIds: ["config-1", "config-2"],
              newAssignmentUserIds: [],
            }}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            queueId="queue-1"
            queueNames={[]}
            onManageScoreConfigsClick={fn()}
            hasQueueAssignmentsReadAccess={false}
            isSubmitting={false}
            onSubmit={fn()}
            submitLabel="Save queue"
          />
        </DialogContent>
      </Dialog>
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
