import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type Prisma } from "@langfuse/shared";
import { Edit, LockIcon, Pen } from "lucide-react";
import { forwardRef, useState } from "react";

interface UpdateDatasetButtonProps {
  projectId: string;
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  datasetMetadata?: Prisma.JsonValue;
  datasetInputSchema?: Prisma.JsonValue;
  datasetExpectedOutputSchema?: Prisma.JsonValue;
  icon?: boolean;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

export const UpdateDatasetButton = forwardRef<
  HTMLButtonElement,
  UpdateDatasetButtonProps
>((props, ref) => {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  const actionButton = props.icon ? (
    <IconOnlyButton
      ref={ref}
      icon={<Pen className="h-4 w-4" />}
      label="Edit"
      aria-label="edit"
      disabledReason={
        hasAccess
          ? undefined
          : "You don't have permission to edit this dataset."
      }
      variant={props.variant}
      size={props.size}
      className={props.className}
      onClick={(event) => {
        event.stopPropagation();
        setOpen(true);
        capture("datasets:update_form_open", {
          source: "table-single-row",
        });
      }}
    />
  ) : (
    <Button
      ref={ref}
      variant={props.variant || "ghost"}
      size={props.size || "icon"}
      className={props.className}
      disabled={!hasAccess}
      onClick={() => {
        setOpen(true);
        capture("datasets:update_form_open", {
          source: "table-single-row",
        });
      }}
    >
      {hasAccess ? (
        <Edit className="mr-2 h-4 w-4" />
      ) : (
        <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      Edit
    </Button>
  );

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      {props.icon ? (
        actionButton
      ) : (
        <DialogTrigger asChild>{actionButton}</DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] sm:max-w-2xl md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Update dataset</DialogTitle>
        </DialogHeader>
        <DatasetForm
          mode="update"
          projectId={props.projectId}
          onFormSuccess={() => setOpen(false)}
          datasetId={props.datasetId}
          datasetName={props.datasetName}
          datasetDescription={props.datasetDescription}
          datasetMetadata={props.datasetMetadata}
          datasetInputSchema={props.datasetInputSchema}
          datasetExpectedOutputSchema={props.datasetExpectedOutputSchema}
        />
      </DialogContent>
    </Dialog>
  );
});

UpdateDatasetButton.displayName = "UpdateDatasetButton";
