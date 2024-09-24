import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { ChevronDown } from "lucide-react";
import { AnnotationQueueObjectType, type Prisma } from "@langfuse/shared";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { CreateNewAnnotationQueueItem } from "@/src/features/scores/components/CreateNewAnnotationQueueItem";
import { useState } from "react";

export const AddTraceToButton = (props: {
  projectId: string;
  traceId: string;
  observationId?: string;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          onMouseEnter={() => setIsDropdownOpen(true)}
        >
          Reference
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <CreateNewAnnotationQueueItem
          projectId={props.projectId}
          itemId={props.observationId ?? props.traceId}
          itemType={
            !!props.observationId
              ? AnnotationQueueObjectType.OBSERVATION
              : AnnotationQueueObjectType.TRACE
          }
        />
        <NewDatasetItemFromTrace
          traceId={props.traceId}
          projectId={props.projectId}
          input={props.input}
          output={props.output}
          metadata={props.metadata}
          key={props.traceId}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
