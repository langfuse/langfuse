import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
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
    const form = useForm({ defaultValues: { targetId: "queue-1" } });

    return (
      <Dialog open onOpenChange={fn()}>
        <DialogContent className="sm:max-w-md">
          <AddTracesToAnnotationQueueSelectDialogContent
            description="Add 12 selected traces to an annotation queue."
            form={form}
            queueOptionsState={{
              status: "ready",
              options: [
                { id: "queue-1", name: "Support review" },
                { id: "queue-2", name: "Quality audit" },
              ],
            }}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            createQueueState={{ status: "enabled" }}
            hasAccess={true}
            batchActionState={{ status: "ready", canConfirm: true }}
          />
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
