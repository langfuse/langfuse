import { Button } from "@/src/components/ui/button";
import { Edit, LockIcon, PlusIcon, Trash } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { DatasetForm } from "@/src/features/datasets/components/DatasetForm";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type Prisma } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface BaseDatasetButtonProps {
  mode: "create" | "update" | "delete";
  projectId: string;
  className?: string;
  onFormSuccess?: () => void;
}

interface CreateDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "create";
}

interface DeleteDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "delete";
  datasetId: string;
}

interface UpdateDatasetButtonProps extends BaseDatasetButtonProps {
  mode: "update";
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  datasetMetadata?: Prisma.JsonValue;
  icon?: boolean;
}

type DatasetActionButtonProps =
  | CreateDatasetButtonProps
  | UpdateDatasetButtonProps
  | DeleteDatasetButtonProps;

export const DatasetActionButton = (props: DatasetActionButtonProps) => {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {props.mode === "update" ? (
          props.icon ? (
            <Button
              variant="outline"
              size={"icon"}
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
            <div
              className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
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
              Rename
            </div>
          )
        ) : props.mode === "delete" ? (
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            onClick={() => {
              setOpen(true);
              capture("datasets:delete_form_open", {
                source: "table-single-row",
              });
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </div>
        ) : (
          <Button
            className={props.className}
            disabled={!hasAccess}
            onClick={() => capture("datasets:new_form_open")}
          >
            {hasAccess ? (
              <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
            ) : (
              <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
            )}
            New dataset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
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
          />
        ) : props.mode === "delete" ? (
          <DatasetForm
            mode="delete"
            projectId={props.projectId}
            onFormSuccess={() => setOpen(false)}
            datasetId={props.datasetId}
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
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
