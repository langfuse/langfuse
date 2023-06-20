import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function JSONview(props: { json: string | unknown }) {
  const text =
    typeof props.json === "string"
      ? props.json
      : JSON.stringify(props.json, null, 2);

  return <CodeView>{text}</CodeView>;
}

export function CodeView(props: {
  children: string | undefined | null;
  className?: string;
}) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(props.children ?? "");
    setTimeout(() => setIsCopied(false), 1000);
  };

  return (
    <code
      className={cn(
        "relative block max-w-full whitespace-pre-wrap break-words rounded-md border px-4 py-3 pr-12 font-mono text-sm",
        props.className
      )}
    >
      {props.children}
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
  );
}
