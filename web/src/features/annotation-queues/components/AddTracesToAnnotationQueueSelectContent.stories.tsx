import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { useForm } from "react-hook-form";
import { fn } from "storybook/test";

import { AddTracesToAnnotationQueueSelectContent } from "./AddTracesToAnnotationQueueSelectContent";

const meta = preview.meta({
  component: AddTracesToAnnotationQueueSelectContent,
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
          <AddTracesToAnnotationQueueSelectContent
            description="Add 12 selected traces to an annotation queue."
            form={form}
            queueOptions={[
              { id: "queue-1", name: "Support review" },
              { id: "queue-2", name: "Quality audit" },
            ]}
            isQueueOptionsLoading={false}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            canCreateQueue={true}
            hasAccess={true}
            isBatchActionInProgress={false}
            isConfirmLoading={false}
            isConfirmDisabled={false}
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
          <AddTracesToAnnotationQueueSelectContent
            description="Add 3 selected traces to an annotation queue."
            form={form}
            queueOptions={[]}
            isQueueOptionsLoading={false}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            canCreateQueue={true}
            hasAccess={true}
            isBatchActionInProgress={false}
            isConfirmLoading={false}
            isConfirmDisabled={true}
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
          <AddTracesToAnnotationQueueSelectContent
            description="Add 3 selected traces to an annotation queue."
            form={form}
            queueOptions={[]}
            isQueueOptionsLoading={true}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            canCreateQueue={true}
            hasAccess={true}
            isBatchActionInProgress={false}
            isConfirmLoading={true}
            isConfirmDisabled={true}
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
          <AddTracesToAnnotationQueueSelectContent
            description="Add 8 selected traces to an annotation queue."
            form={form}
            queueOptions={[{ id: "queue-1", name: "Only queue" }]}
            isQueueOptionsLoading={false}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            canCreateQueue={false}
            createQueueDisabledReason="Maximum number of annotation queues reached for your plan."
            hasAccess={true}
            isBatchActionInProgress={false}
            isConfirmLoading={false}
            isConfirmDisabled={false}
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
          <AddTracesToAnnotationQueueSelectContent
            description="Add 50 selected traces to an annotation queue."
            form={form}
            queueOptions={[{ id: "queue-1", name: "Support review" }]}
            isQueueOptionsLoading={false}
            onSubmit={fn()}
            onCreateNewQueue={fn()}
            canCreateQueue={true}
            hasAccess={true}
            isBatchActionInProgress={true}
            isConfirmLoading={false}
            isConfirmDisabled={true}
          />
        </DialogContent>
      </Dialog>
    );
  },
});
