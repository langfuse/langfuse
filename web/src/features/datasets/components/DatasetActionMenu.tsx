import { Bot, Copy, Edit, LockIcon, Trash } from "lucide-react";
import { type ComponentProps, useMemo } from "react";

import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { DeleteDatasetDialogController } from "./DeleteDatasetDialogController";
import { DuplicateDatasetDialogController } from "./DuplicateDatasetDialogController";
import { UpdateDatasetDialogController } from "./UpdateDatasetDialogController";

type DatasetActionMenuProps = Omit<
  ComponentProps<typeof UpdateDatasetDialogController>,
  "children" | "source"
> & {
  children: ComponentProps<typeof DropdownMenu>["children"];
  manageEvaluatorsHref?: string;
};

type ActionControl = {
  disabled: { reason: string } | undefined;
  openDialog: () => void;
};

function DatasetActionDropdown({
  deleteControl,
  duplicateControl,
  children,
  manageEvaluatorsHref,
  updateControl,
}: {
  deleteControl: ActionControl;
  duplicateControl: ActionControl;
  children: ComponentProps<typeof DropdownMenu>["children"];
  manageEvaluatorsHref?: string;
  updateControl: ActionControl;
}) {
  const items = useMemo<ComponentProps<typeof DropdownMenu>["items"]>(
    () => [
      {
        type: "item",
        id: "edit",
        title: "Edit",
        icon: updateControl.disabled ? LockIcon : Edit,
        disabled: updateControl.disabled,
        onClick: updateControl.openDialog,
      },
      {
        type: "item",
        id: "duplicate",
        title: "Duplicate",
        icon: duplicateControl.disabled ? LockIcon : Copy,
        disabled: duplicateControl.disabled,
        onClick: duplicateControl.openDialog,
      },
      {
        type: "item",
        id: "delete",
        title: "Delete",
        icon: deleteControl.disabled ? LockIcon : Trash,
        disabled: deleteControl.disabled,
        onClick: deleteControl.openDialog,
      },
      ...(manageEvaluatorsHref
        ? [
            {
              type: "item" as const,
              id: "manage-evaluators",
              title: "Manage Evaluators",
              icon: Bot,
              href: manageEvaluatorsHref,
            },
          ]
        : []),
    ],
    [deleteControl, duplicateControl, manageEvaluatorsHref, updateControl],
  );

  return (
    <DropdownMenu items={items} placement="bottom-end">
      {children}
    </DropdownMenu>
  );
}

export function DatasetActionMenu({
  children,
  manageEvaluatorsHref,
  ...datasetProps
}: DatasetActionMenuProps) {
  return (
    <UpdateDatasetDialogController {...datasetProps} source="dataset">
      {(updateControl) => (
        <DuplicateDatasetDialogController
          projectId={datasetProps.projectId}
          datasetId={datasetProps.datasetId}
        >
          {(duplicateControl) => (
            <DeleteDatasetDialogController
              projectId={datasetProps.projectId}
              datasetId={datasetProps.datasetId}
              datasetName={datasetProps.datasetName}
              redirectUrl={`/project/${datasetProps.projectId}/datasets`}
              source="dataset"
            >
              {(deleteControl) => (
                <DatasetActionDropdown
                  updateControl={updateControl}
                  duplicateControl={duplicateControl}
                  deleteControl={deleteControl}
                  manageEvaluatorsHref={manageEvaluatorsHref}
                >
                  {children}
                </DatasetActionDropdown>
              )}
            </DeleteDatasetDialogController>
          )}
        </DuplicateDatasetDialogController>
      )}
    </UpdateDatasetDialogController>
  );
}
