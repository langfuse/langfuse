import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function JSONView(props: {
  json: string | unknown;
  defaultCollapsed?: boolean;
}) {
  const text =
    typeof props.json === "string"
      ? props.json
      : JSON.stringify(props.json, null, 2);

  return <CodeView content={text} defaultCollapsed={props.defaultCollapsed} />;
}

export function CodeView(props: {
  content: string | undefined | null;
  className?: string;
  defaultCollapsed?: boolean;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [displayedTruncate, setTruncate] = useState(props.defaultCollapsed);

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(props.content ?? "");
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handleShowAll = () => {
    displayedTruncate
      ? setTruncate(undefined)
      : setTruncate(props.defaultCollapsed);
  };

  return (
    <div className="rounded-md border px-4">
      <code
        className={cn(
          "relative my-3 max-w-full whitespace-pre-wrap  break-words pr-12  font-mono text-xs",
          displayedTruncate ? `line-clamp-4` : "block",
          props.className
        )}
      >
        {props.content}
        {props.defaultCollapsed ? (
          <Button
            className="absolute right-8 top-2"
            variant="secondary"
            size="xs"
            onClick={handleShowAll}
          >
            {displayedTruncate ? (
              <ChevronsUpDown className="h-3 w-3" />
            ) : (
              <ChevronsDownUp className="h-3 w-3" />
            )}
          </Button>
        ) : undefined}
        <Button
          className="absolute right-0 top-2"
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
