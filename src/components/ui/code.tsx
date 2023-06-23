import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function JSONview(props: { json: string | unknown; maxLines?: number }) {
  const text =
    typeof props.json === "string"
      ? props.json
      : JSON.stringify(props.json, null, 2);

  return <CodeView content={text} maxLines={props.maxLines} />;
}

export function CodeView(props: {
  content: string | undefined | null;
  className?: string;
  maxLines?: number;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [displayedMaxLines, setMaxLines] = useState(props.maxLines);

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(props.content ?? "");
    setTimeout(() => setIsCopied(false), 1000);
  };

  const handleShowAll = () => {
    console.log("hello");
    displayedMaxLines ? setMaxLines(undefined) : setMaxLines(props.maxLines);
  };

  return (
    <div className="rounded-md border px-4 ">
      <code
        className={cn(
          `relative my-3 max-w-full whitespace-pre-wrap  break-words pr-12  font-mono text-xs ${
            displayedMaxLines ? `line-clamp-${displayedMaxLines}` : "block"
          }`,
          props.className
        )}
      >
        {props.content}
        {props.maxLines ? (
          <Button
            className="absolute right-8 top-2"
            variant="secondary"
            size="xs"
            onClick={handleShowAll}
          >
            {displayedMaxLines ? (
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
