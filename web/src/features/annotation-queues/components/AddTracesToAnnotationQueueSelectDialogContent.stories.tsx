import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { AnnotationQueueFormDialogContent } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogContent";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateQueueWithAssignmentsData,
  type CreateQueueWithAssignments,
} from "@langfuse/shared";
import { useState } from "react";
import { flushSync } from "react-dom";
import { useForm } from "react-hook-form";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { AddTracesToAnnotationQueueSelectDialogContent } from "./AddTracesToAnnotationQueueSelectDialogContent";

const meta = preview.meta({
  component: AddTracesToAnnotationQueueSelectDialogContent,
  parameters: {
    layout: "fullscreen",
  },
});

export const CreateQueueInStackedDialog = meta.story({
  name: "(Test) Create Queue In Stacked Dialog",
  render: () => {
    const [createOpen, setCreateOpen] = useState(false);
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
        scoreConfigIds: ["config-1"],
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
      flushSync(() => setQueueOptions((current) => current.concat(queue)));
      selectForm.setValue("targetId", queue.id);
      createForm.reset();
      setCreateOpen(false);
    };

    return (
      <>
        <Dialog open onOpenChange={fn()}>
          <DialogContent className="sm:max-w-md">
            <AddTracesToAnnotationQueueSelectDialogContent
              description="Add 12 selected traces to an annotation queue."
              form={selectForm}
              queueOptionsState={{ status: "ready", options: queueOptions }}
              onSubmit={fn()}
              onCreateNewQueue={() => setCreateOpen(true)}
              createQueueState={{ status: "enabled" }}
              hasAccess={true}
              batchActionState={{ status: "ready", canConfirm: true }}
            />
          </DialogContent>
        </Dialog>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            {createOpen ? (
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
                submitLabel="Create queue"
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await body.findByRole("button", { name: "Create new queue" }),
    );
    await waitFor(() =>
      expect(body.getAllByRole("dialog", { hidden: true })).toHaveLength(2),
    );

    await userEvent.type(
      body.getByRole("textbox", { name: "Name" }),
      "Escalation review",
    );
    await userEvent.click(body.getByRole("button", { name: "Create queue" }));

    await waitFor(() =>
      expect(body.getAllByRole("dialog", { hidden: true })).toHaveLength(1),
    );
    await expect(body.getByRole("combobox")).toHaveTextContent(
      "Escalation review",
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
