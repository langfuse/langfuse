import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function JSONView(props: {
  json: string | unknown;
  defaultCollapsed?: boolean;
  scrollable?: boolean;
  title?: string;
  className?: string;
}) {
  const text =
    typeof props.json === "string"
      ? props.json
      : JSON.stringify(props.json, null, 2);

  return (
    <CodeView
      content={text}
      defaultCollapsed={props.defaultCollapsed}
      scrollable={props.scrollable}
      title={props.title}
      className={props.className}
    />
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
        <div className="border-b px-4 py-1 text-xs font-medium">
          {props.title}
        </div>
      ) : undefined}
      <div className="flex gap-2">
        <code
          className={cn(
            "relative flex-1 whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs",
            isCollapsed ? `line-clamp-4` : "block",
            props.scrollable ? "max-h-60 overflow-y-scroll" : undefined
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
