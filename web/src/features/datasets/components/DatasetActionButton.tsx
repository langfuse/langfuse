import { Button, type ButtonProps } from "@/src/components/ui/button";
import { Edit, LockIcon, PlusIcon, Trash } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState, forwardRef } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type Prisma } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface BaseDatasetButtonProps {
  mode: "create" | "update" | "delete";
  projectId: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

interface CreateDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "create";
  folderPrefix?: string;
}

interface DeleteDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "delete";
  datasetId: string;
  datasetName: string;
}

interface UpdateDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "update";
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  datasetMetadata?: Prisma.JsonValue;
  datasetInputSchema?: Prisma.JsonValue;
  datasetExpectedOutputSchema?: Prisma.JsonValue;
  icon?: boolean;
}

type DatasetActionButtonProps =
  | CreateDatasetButtonProps
  | UpdateDatasetButtonProps
  | DeleteDatasetButtonProps;

export const DatasetActionButton = forwardRef<
  HTMLButtonElement,
  DatasetActionButtonProps
>((props, ref) => {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {props.mode === "update" ? (
          props.icon ? (
            <Button
              ref={ref}
              variant={props.variant || "outline"}
              size={props.size || "icon"}
              className={props.className}
              disabled={!hasAccess}
              onClick={() =>
                capture("datasets:update_form_open", {
                  source: "dataset",
                })
              }
            >
              <Edit className="h-4 w-4" />
            </Button>
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
          )
        ) : props.mode === "delete" ? (
          <Button
            ref={ref}
            variant={props.variant || "ghost"}
            size={props.size}
            className={props.className}
            disabled={!hasAccess}
            onClick={() => {
              setOpen(true);
              capture("datasets:delete_form_open", {
                source: "table-single-row",
              });
            }}
          >
            {hasAccess ? (
              <Trash className="mr-2 h-4 w-4" />
            ) : (
              <LockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Delete
          </Button>
        ) : (
          <Button
            ref={ref}
            size={props.size}
            className={props.className}
            disabled={!hasAccess}
            onClick={() => capture("datasets:new_form_open")}
            variant={props.variant || "default"}
          >
            {hasAccess ? (
              <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" aria-hidden="true" />
            ) : (
              <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
            )}
            New dataset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl md:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-4">
            {props.mode === "create"
              ? "Create new dataset"
              : props.mode === "delete"
                ? "Please confirm"
                : "Update dataset"}
          </DialogTitle>
          {props.mode === "delete" && (
            <DialogDescription className="text-md p-0">
              This action cannot be undone and removes all the data associated
              with this dataset.
            </DialogDescription>
          )}
        </DialogHeader>

        {props.mode === "create" ? (
          <DatasetForm
            mode="create"
            projectId={props.projectId}
            onFormSuccess={() => setOpen(false)}
            folderPrefix={props.folderPrefix}
          />
        ) : props.mode === "delete" ? (
          <DatasetForm
            mode="delete"
            projectId={props.projectId}
            onFormSuccess={() => setOpen(false)}
            datasetId={props.datasetId}
            datasetName={props.datasetName}
          />
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
});

DatasetActionButton.displayName = "DatasetActionButton";
