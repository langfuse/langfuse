import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { default as React18JsonView } from "react18-json-view";
import "react18-json-view/src/dark.css";
import { deepParseJson } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useTheme } from "next-themes";

export function JSONView(props: {
  json?: unknown;
  title?: string;
  className?: string;
  isLoading?: boolean;
  codeClassName?: string;
}) {
  // some users ingest stringified json nested in json, parse it
  const parsedJson = deepParseJson(props.json);
  const { resolvedTheme } = useTheme();
  return (
    <div className={cn("rounded-md border", props.className)}>
      {props.title ? (
        <div
          className={cn(
            props.title === "assistant" || props.title === "Output"
              ? "dark:border-accent-dark-green"
              : "",
            "border-b px-3 py-1 text-xs font-medium",
          )}
        >
          {props.title}
        </div>
      ) : undefined}
      <div
        className={cn(
          "flex gap-2 whitespace-pre-wrap break-words p-3 text-xs",
          props.codeClassName,
        )}
      >
        {props.isLoading ? (
          <Skeleton className="h-3 w-3/4" />
        ) : (
          <React18JsonView
            src={parsedJson}
            theme="github"
            dark={resolvedTheme === "dark"}
            collapseObjectsAfterLength={20}
            collapseStringsAfterLength={500}
            displaySize={"collapsed"}
            matchesURL={true}
            customizeCopy={(node) => stringifyJsonNode(node)}
            className="w-full"
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

export const IOTableCell = ({
  data,
  isLoading = false,
  className,
  singleLine = false,
}: {
  data: unknown;
  isLoading?: boolean;
  className?: string;
  singleLine?: boolean;
}) => {
  return (
    <>
      {isLoading ? (
        <JsonSkeleton className="h-full w-[400px] overflow-hidden px-2 py-1" />
      ) : singleLine ? (
        <div
          className={cn(
            "h-full w-[400px] self-stretch overflow-hidden overflow-y-auto truncate rounded-sm border px-2 py-0.5",
            className,
          )}
        >
          {stringifyJsonNode(data)}
        </div>
      ) : (
        <JSONView
          json={stringifyJsonNode(data)}
          className={cn(
            "h-full w-[400px] self-stretch overflow-y-auto rounded-sm ",
            className,
          )}
          codeClassName="py-1 px-2"
        />
      )}
    </>
  );
};

export const JsonSkeleton = ({
  className,
  numRows = 10,
}: {
  numRows?: number;
  className?: string;
}) => {
  return (
    <div className={cn("w-[400px] rounded-md border", className)}>
      <div className="flex flex-col gap-1">
        {[...Array<number>(numRows)].map((_, i) => (
          <Skeleton
            className={cn(
              "h-4 w-full",
              i === numRows - 1 ? "w-3/4" : undefined,
            )}
            key={i}
          />
        ))}
      </div>
    </div>
  );
};

function stringifyJsonNode(node: unknown) {
  // return single string nodes without quotes
  if (typeof node === "string") {
    return node;
  }

  try {
    return JSON.stringify(
      node,
      (key, value) => {
        switch (typeof value) {
          case "bigint":
            return String(value) + "n";
          case "number":
          case "boolean":
          case "object":
          case "string":
            return value as string;
          default:
            return String(value);
        }
      },
      4,
    );
  } catch (error) {
    console.error("JSON stringify error", error);
    return "Error: JSON.stringify failed";
  }
}
