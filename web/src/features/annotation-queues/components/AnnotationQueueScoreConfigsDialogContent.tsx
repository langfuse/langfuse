import { type ReactNode, useState } from "react";
import { Info } from "lucide-react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export function AnnotationQueueScoreConfigsDialogContent({
  initialValue,
  isSubmitting,
  onSubmit,
  children,
}: {
  initialValue: string[];
  isSubmitting: boolean;
  onSubmit: (ids: string[]) => void;
  children: (control: {
    value: string[];
    onChange: (ids: string[]) => void;
  }) => ReactNode;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = () => {
    setSubmitted(true);
    if (value.length > 0) onSubmit(value);
  };
  return (
    <Dialog
      stopPropagationOnEnterSpace={false}
      title="Edit score configs"
      size="lg"
      actions={[
        {
          label: "Save score configs",
          loading: isSubmitting,
          onClick: handleSubmit,
        },
      ]}
    >
      <Dialog.Body>
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground">
            Choose the fields annotators see. Drag to set their order.
          </p>
          <Tooltip label="Changes apply when items are reopened, including completed items. Historical scores and completion status stay unchanged. Score config definitions are project-wide; editing one affects future scoring wherever it is used.">
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                icon={Info}
                label="How queue changes apply"
              />
            )}
          </Tooltip>
        </div>
        {children({ value, onChange: setValue })}
        {submitted && value.length === 0 && (
          <p className="text-destructive text-sm" role="alert">
            Add or create at least one score config.
          </p>
        )}
      </Dialog.Body>
    </Dialog>
  );
}
