import { ArrowUpRight, LockIcon } from "lucide-react";
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
        <p className="text-sm font-medium">{title}</p>
        <p className="pt-2 text-sm text-muted-foreground">
          Learn more about{" "}
          <a
            href="https://json-schema.org/learn/miscellaneous-examples"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center underline hover:text-foreground"
          >
            JSON Schema
            <ArrowUpRight className="ml-0.5 h-3 w-3" />
          </a>
        </p>
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
