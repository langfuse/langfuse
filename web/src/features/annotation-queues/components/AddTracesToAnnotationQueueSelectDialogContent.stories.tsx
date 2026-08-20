import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { AnnotationQueueFormDialogContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogContent";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
} from "@langfuse/shared";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { fn } from "storybook/test";

import { AddTracesToAnnotationQueueSelectDialogContent } from "./AddTracesToAnnotationQueueSelectDialogContent";

const meta = preview.meta({
  component: AddTracesToAnnotationQueueSelectDialogContent,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  render: () => {
    const [step, setStep] = useState<"select" | "create">("select");
    const [queueOptions, setQueueOptions] = useState([
      { id: "queue-1", name: "Support review" },
      { id: "queue-2", name: "Quality audit" },
    ]);
    const selectForm = useForm({ defaultValues: { targetId: "queue-1" } });
    const createForm = useForm({
      resolver: zodResolver(CreateQueueWithAssignmentsData),
      defaultValues: {
        name: "",
        description: "",
        scoreConfigIds: [],
        newAssignmentUserIds: [],
      },
    });

    const handleScoreConfigValueChange = (values: Record<string, string>[]) => {
      createForm.setValue(
        "scoreConfigIds",
        values.map((value) => value.key),
      );
      if (values.length === 0) {
        createForm.setError("scoreConfigIds", {
          type: "manual",
          message: "At least 1 score config must be selected",
        });
      } else {
        createForm.clearErrors("scoreConfigIds");
      }
    };

    const handleCreate = (data: CreateQueueWithAssignments) => {
      const queue = { id: `queue-${queueOptions.length + 1}`, name: data.name };
      setQueueOptions((current) => current.concat(queue));
      selectForm.setValue("targetId", queue.id);
      createForm.reset();
      setStep("select");
    };

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent
          className={
            step === "create"
              ? "max-h-[90vh] overflow-y-auto sm:max-w-lg"
              : "sm:max-w-md"
          }
        >
          {step === "select" ? (
            <AddTracesToAnnotationQueueSelectDialogContent
              description="Add 12 selected traces to an annotation queue."
              form={selectForm}
              queueOptionsState={{ status: "ready", options: queueOptions }}
              onSubmit={fn()}
              onCreateNewQueue={() => setStep("create")}
              createQueueState={{ status: "enabled" }}
              hasAccess={true}
              batchActionState={{ status: "ready", canConfirm: true }}
            />
          ) : (
            <>
              <div className="mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setStep("select")}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
              </div>
              <AnnotationQueueFormDialogContent
                mode="create"
                form={createForm}
                scoreConfigs={[
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
                ]}
                projectId="project-1"
                onScoreConfigValueChange={handleScoreConfigValueChange}
                onManageScoreConfigsClick={fn()}
                isAdvancedOpen={false}
                onAdvancedOpenChange={fn()}
                hasQueueAssignmentsReadAccess={false}
                userAssignmentSection={null}
                isSubmitting={false}
                onSubmit={handleCreate}
                submitLabel="Create queue and add traces"
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  },
});

export const Empty = meta.story({
  render: () => {
    const form = useForm({ defaultValues: { targetId: "" } });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="sm:max-w-md">
          <AddTracesToAnnotationQueueSelectDialogContent
            description="Add 3 selected traces to an annotation queue."
            form={form}
            queueOptionsState={{ status: "ready", options: [] }}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            createQueueState={{ status: "enabled" }}
            hasAccess={true}
            batchActionState={{ status: "ready", canConfirm: false }}
          />
        </DialogContent>
      </Dialog>
    );
  },
});

export const Loading = meta.story({
  render: () => {
    const form = useForm({ defaultValues: { targetId: "" } });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="sm:max-w-md">
          <AddTracesToAnnotationQueueSelectDialogContent
            description="Add 3 selected traces to an annotation queue."
            form={form}
            queueOptionsState={{ status: "loading" }}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            createQueueState={{ status: "enabled" }}
            hasAccess={true}
            batchActionState={{ status: "checking" }}
          />
        </DialogContent>
      </Dialog>
    );
  },
});

export const CreateDisabled = meta.story({
  render: () => {
    const form = useForm({ defaultValues: { targetId: "queue-1" } });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="sm:max-w-md">
          <AddTracesToAnnotationQueueSelectDialogContent
            description="Add 8 selected traces to an annotation queue."
            form={form}
            queueOptionsState={{
              status: "ready",
              options: [{ id: "queue-1", name: "Only queue" }],
            }}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            createQueueState={{
              status: "disabled",
              reason:
                "Maximum number of annotation queues reached for your plan.",
            }}
            hasAccess={true}
            batchActionState={{ status: "ready", canConfirm: true }}
          />
        </DialogContent>
      </Dialog>
    );
  },
});

export const BatchActionInProgress = meta.story({
  render: () => {
    const form = useForm({ defaultValues: { targetId: "queue-1" } });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="sm:max-w-md">
          <AddTracesToAnnotationQueueSelectDialogContent
            description="Add 50 selected traces to an annotation queue."
            form={form}
            queueOptionsState={{
              status: "ready",
              options: [{ id: "queue-1", name: "Support review" }],
            }}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            createQueueState={{ status: "enabled" }}
            hasAccess={true}
            batchActionState={{ status: "inProgress" }}
          />
        </DialogContent>
      </Dialog>
    );
  },
});
