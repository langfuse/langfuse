import { LockIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTitle,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { CodeMirrorEditor } from "@/src/components/editor";
import type { Prisma } from "@langfuse/shared";

type DatasetSchemaHoverCardProps = {
  schema: Prisma.JsonValue;
  schemaType: "input" | "expectedOutput";
};

export const DatasetSchemaHoverCard: React.FC<DatasetSchemaHoverCardProps> = ({
  schema,
  schemaType,
}) => {
  const title =
    schemaType === "input" ? "Input Schema" : "Expected Output Schema";

  const schemaString = JSON.stringify(schema, null, 2);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={`View ${title}`}
        >
          <LockIcon className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="max-h-[500px] w-[400px] overflow-auto">
        <HoverCardTitle>{title}</HoverCardTitle>
        <div className="mt-2">
          <CodeMirrorEditor
            mode="json"
            value={schemaString}
            onChange={() => {}} // Read-only
            minHeight="none"
            className="max-h-[400px] overflow-y-auto"
            editable={false}
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
