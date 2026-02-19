import { ArrowUpRight, LockIcon, Copy, Check } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { CodeMirrorEditor } from "@/src/components/editor";
import type { Prisma } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import { useMemo, useState } from "react";
import { generateSchemaExample } from "../lib/generateSchemaExample";
import { copyTextToClipboard } from "@/src/utils/clipboard";

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

  // Generate example object from schema
  const exampleObject = useMemo(() => generateSchemaExample(schema), [schema]);

  // State for copy button feedback
  const [copied, setCopied] = useState(false);

  const handleCopyExample = async () => {
    if (!exampleObject) return;

    await copyTextToClipboard(exampleObject);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      <HoverCardContent
        className="max-h-[80vh] w-[400px] overflow-auto"
        collisionPadding={20}
      >
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
            className="max-h-[250px] overflow-y-auto"
            editable={false}
          />
        </div>

        {exampleObject && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Example Object</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyExample}
                className="h-7 px-2"
              >
                {copied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="mt-2">
              <CodeMirrorEditor
                mode="json"
                value={exampleObject}
                className="max-h-[250px] overflow-y-auto"
                editable={false}
              />
            </div>
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
};
