import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { default as React18JsonView } from "react18-json-view";
import { deepParseJson } from "@/src/utils/json";
import { Skeleton } from "@/src/components/ui/skeleton";

export function JSONView(props: {
  json?: unknown;
  title?: string;
  className?: string;
  isLoading?: boolean;
}) {
  // some users ingest stringified json nested in json, parse it
  const parsedJson = deepParseJson(props.json);

  return (
    <div className={cn("max-w-full rounded-md border ", props.className)}>
      {props.title ? (
        <div className="border-b px-3 py-1 text-xs font-medium">
          {props.title}
        </div>
      ) : undefined}
      <div className="flex gap-2 whitespace-pre-wrap p-3 text-xs">
        {props.isLoading ? (
          <Skeleton className="h-3 w-3/4" />
        ) : (
          <React18JsonView
            src={parsedJson}
            theme="github"
            collapseObjectsAfterLength={20}
            collapseStringsAfterLength={500}
            displaySize={"collapsed"}
            matchesURL={true}
          />
        )}
      </div>
    </div>
  );
}

export function CodeView(props: {
  content: string | undefined | null;
  className?: string;
  defaultCollapsed?: boolean;
  scrollable?: boolean;
  title?: string;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setCollapsed] = useState(props.defaultCollapsed);

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(props.content ?? "");
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handleShowAll = () => setCollapsed(!isCollapsed);

  return (
    <div className={cn("max-w-full rounded-md border ", props.className)}>
      {props.title ? (
        <div className="border-b px-3 py-1 text-xs font-medium">
          {props.title}
        </div>
      ) : undefined}
      <div className="flex gap-2">
        <code
          className={cn(
            "relative flex-1 whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs",
            isCollapsed ? `line-clamp-6` : "block",
            props.scrollable ? "max-h-60 overflow-y-scroll" : undefined,
          )}
        >
          {props.content}
        </code>
        <div className="flex gap-2 py-2 pr-2">
          {props.defaultCollapsed ? (
            <Button variant="secondary" size="xs" onClick={handleShowAll}>
              {isCollapsed ? (
                <ChevronsUpDown className="h-3 w-3" />
              ) : (
                <ChevronsDownUp className="h-3 w-3" />
              )}
            </Button>
          ) : undefined}
          <Button variant="secondary" size="xs" onClick={handleCopy}>
            {isCopied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
