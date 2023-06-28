import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function JSONView(props: {
  json: string | unknown;
  defaultCollapsed?: boolean;
  label?: string;
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
      label={props.label}
      className={props.className}
    />
  );
}

export function CodeView(props: {
  content: string | undefined | null;
  className?: string;
  defaultCollapsed?: boolean;
  label?: string;
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
    <div
      className={cn(
        "relative max-w-full rounded-md border px-4 py-3 pr-12",
        props.className
      )}
    >
      {props.label ? (
        <div className="text-xs font-medium">{props.label}</div>
      ) : undefined}
      <code
        className={cn(
          "whitespace-pre-wrap break-words font-mono text-xs",
          isCollapsed ? `line-clamp-4` : "block"
        )}
      >
        {props.content}
        {props.defaultCollapsed ? (
          <Button
            className="absolute right-12 top-2"
            variant="secondary"
            size="xs"
            onClick={handleShowAll}
          >
            {isCollapsed ? (
              <ChevronsUpDown className="h-3 w-3" />
            ) : (
              <ChevronsDownUp className="h-3 w-3" />
            )}
          </Button>
        ) : undefined}
        <Button
          className="absolute right-2 top-2"
          variant="secondary"
          size="xs"
          onClick={handleCopy}
        >
          {isCopied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </code>
    </div>
  );
}
