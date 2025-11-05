import { LockIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTitle,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { CodeMirrorEditor } from "@/src/components/editor";
import type { Prisma } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";

type DatasetSchemaHoverCardProps = {
  schema: Prisma.JsonValue;
  schemaType: "input" | "expectedOutput";
  showLabel?: boolean;
};

export const DatasetSchemaHoverCard: React.FC<DatasetSchemaHoverCardProps> = ({
  schema,
  schemaType,
  showLabel = false,
}) => {
  const title =
    schemaType === "input" ? "Input Schema" : "Expected Output Schema";

  const schemaString = JSON.stringify(schema, null, 2);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          variant="ghost"
          className="inline-flex items-center gap-1.5 rounded p-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={`View ${title}`}
          size="sm"
        >
          <LockIcon className={showLabel ? "h-3 w-3" : "h-4 w-4"} />
          {showLabel && <span>Schema enforced</span>}
        </Button>
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
