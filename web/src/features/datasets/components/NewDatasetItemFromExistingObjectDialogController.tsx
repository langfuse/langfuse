import { type ReactNode } from "react";

import { parseJsonPrioritised, type Prisma } from "@langfuse/shared";

import {
  DialogController,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";

type DatasetItemDialogState = {
  traceId?: string;
  observationId?: string;
  fromDatasetId?: string;
  input: Prisma.JsonValue | null;
  output: Prisma.JsonValue | null;
  metadata: MetadataDomainClient;
};

export function NewDatasetItemFromExistingObjectDialogController(props: {
  projectId: string;
  children: (control: {
    openDialog: (payload: DatasetItemDialogState) => void;
  }) => ReactNode;
}) {
  const normalizePrefillValue = (
    value: Prisma.JsonValue | null,
  ): Prisma.JsonValue | null => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "string") {
      const parsed = parseJsonPrioritised(value);
      return parsed !== undefined ? parsed : value;
    }

    return value;
  };

  return (
    <DialogController<DatasetItemDialogState>
      closeOnInteractionOutside={false}
      size="xxl"
      renderContent={({ state, closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>Add item to datasets</DialogTitle>
          </DialogHeader>
          <NewDatasetItemForm
            traceId={state.traceId}
            observationId={state.observationId}
            projectId={props.projectId}
            input={normalizePrefillValue(state.input)}
            output={normalizePrefillValue(state.output)}
            metadata={state.metadata}
            onFormSuccess={closeDialog}
            className="h-full overflow-y-auto"
            currentDatasetId={state.fromDatasetId}
          />
        </>
      )}
    >
      {({ openDialog }) => props.children({ openDialog })}
    </DialogController>
  );
}
