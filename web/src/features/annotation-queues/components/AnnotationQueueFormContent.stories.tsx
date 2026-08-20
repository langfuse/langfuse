import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateQueueWithAssignmentsData } from "@langfuse/shared";
import { useForm } from "react-hook-form";
import { fn } from "storybook/test";

import {
  AnnotationQueueFormContent,
  type AnnotationQueueScoreConfigOption,
} from "./AnnotationQueueFormContent";

const scoreConfigs: AnnotationQueueScoreConfigOption[] = [
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
];

const meta = preview.meta({
  component: AnnotationQueueFormContent,
  parameters: {
    layout: "fullscreen",
  },
});

export const Create = meta.story({
  render: () => {
    const form = useForm({
      resolver: zodResolver(CreateQueueWithAssignmentsData),
      defaultValues: {
        name: "",
        scoreConfigIds: ["config-1"],
        newAssignmentUserIds: [],
      },
    });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormContent
            mode="create"
            form={form}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            onScoreConfigValueChange={fn()}
            onManageScoreConfigsClick={fn()}
            isAdvancedOpen={false}
            onAdvancedOpenChange={fn()}
            hasQueueAssignmentsReadAccess={false}
            userAssignmentSection={null}
            isSubmitting={false}
            onSubmit={fn()}
          />
        </DialogContent>
      </Dialog>
    );
  },
});

export const Edit = meta.story({
  render: () => {
    const form = useForm({
      resolver: zodResolver(CreateQueueWithAssignmentsData),
      defaultValues: {
        name: "Support review queue",
        description: "Weekly support trace review",
        scoreConfigIds: ["config-1", "config-2"],
        newAssignmentUserIds: [],
      },
    });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormContent
            mode="edit"
            form={form}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            onScoreConfigValueChange={fn()}
            onManageScoreConfigsClick={fn()}
            isAdvancedOpen={false}
            onAdvancedOpenChange={fn()}
            hasQueueAssignmentsReadAccess={false}
            userAssignmentSection={null}
            isSubmitting={false}
            onSubmit={fn()}
          />
        </DialogContent>
      </Dialog>
    );
  },
});

export const Submitting = meta.story({
  render: () => {
    const form = useForm({
      resolver: zodResolver(CreateQueueWithAssignmentsData),
      defaultValues: {
        name: "New queue",
        scoreConfigIds: ["config-1"],
        newAssignmentUserIds: [],
      },
    });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormContent
            mode="create"
            form={form}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            onScoreConfigValueChange={fn()}
            onManageScoreConfigsClick={fn()}
            isAdvancedOpen={false}
            onAdvancedOpenChange={fn()}
            hasQueueAssignmentsReadAccess={false}
            userAssignmentSection={null}
            isSubmitting={true}
            onSubmit={fn()}
          />
        </DialogContent>
      </Dialog>
    );
  },
});

export const WithAdvancedOpen = meta.story({
  render: () => {
    const form = useForm({
      resolver: zodResolver(CreateQueueWithAssignmentsData),
      defaultValues: {
        name: "Team queue",
        scoreConfigIds: ["config-1"],
        newAssignmentUserIds: ["user-1"],
      },
    });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <AnnotationQueueFormContent
            mode="create"
            form={form}
            scoreConfigs={scoreConfigs}
            projectId="project-1"
            onScoreConfigValueChange={fn()}
            onManageScoreConfigsClick={fn()}
            isAdvancedOpen={true}
            onAdvancedOpenChange={fn()}
            hasQueueAssignmentsReadAccess={true}
            userAssignmentSection={
              <p className="text-muted-foreground text-sm">
                User assignment slot
              </p>
            }
            isSubmitting={false}
            onSubmit={fn()}
          />
        </DialogContent>
      </Dialog>
    );
  },
});
