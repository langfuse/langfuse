import { type ReactNode } from "react";

import { parseJsonPrioritised, type Prisma } from "@langfuse/shared";

import {
  DialogController,
  DialogHeader,
  DialogTitle,
  type DialogTrigger,
} from "@/src/components/ui/dialog";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";

export function NewDatasetItemFromExistingObjectDialogController(props: {
  projectId: string;
  traceId?: string;
  observationId?: string;
  fromDatasetId?: string;
  input: Prisma.JsonValue | null;
  output: Prisma.JsonValue | null;
  metadata: MetadataDomainClient;
  children: (control: {
    openDialog: () => void;
    Trigger: typeof DialogTrigger;
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
    <DialogController
      closeOnInteractionOutside={false}
      size="xxl"
      renderContent={({ closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>Add item to datasets</DialogTitle>
          </DialogHeader>
          <NewDatasetItemForm
            traceId={props.traceId}
            observationId={props.observationId}
            projectId={props.projectId}
            input={normalizePrefillValue(props.input)}
            output={normalizePrefillValue(props.output)}
            metadata={props.metadata}
            onFormSuccess={closeDialog}
            className="h-full overflow-y-auto"
            currentDatasetId={props.fromDatasetId}
          />
        </>
      )}
    >
      {({ openDialog, Trigger }) => props.children({ openDialog, Trigger })}
    </DialogController>
  );
}
