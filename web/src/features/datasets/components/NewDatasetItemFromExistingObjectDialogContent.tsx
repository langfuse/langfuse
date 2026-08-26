import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { NewDatasetItemForm } from "./NewDatasetItemForm";
import { type Prisma } from "@langfuse/shared";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";

export type NewDatasetItemFromExistingObjectDialogContentProps = {
  projectId: string;
  traceId?: string;
  observationId?: string;
  fromDatasetId?: string;
  input: Prisma.JsonValue | null;
  output: Prisma.JsonValue | null;
  metadata: MetadataDomainClient;
  onFormSuccess: () => void;
};

export const NewDatasetItemFromExistingObjectDialogContent = ({
  projectId,
  traceId,
  observationId,
  fromDatasetId,
  input,
  output,
  metadata,
  onFormSuccess,
}: NewDatasetItemFromExistingObjectDialogContentProps) => (
  <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
    <DialogHeader>
      <DialogTitle>Add item to datasets</DialogTitle>
    </DialogHeader>
    <NewDatasetItemForm
      traceId={traceId}
      observationId={observationId}
      projectId={projectId}
      input={input}
      output={output}
      metadata={metadata}
      onFormSuccess={onFormSuccess}
      className="h-full overflow-y-auto"
      currentDatasetId={fromDatasetId}
    />
  </DialogContent>
);
