import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function JSONView(props: {
  json: unknown;
  defaultCollapsed?: boolean;
  scrollable?: boolean;
  title?: string;
  className?: string;
}) {
  const text = parseJsonInput(props.json);

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

const parseJsonInput = (jsonIn: unknown): string => {
  if (typeof jsonIn === "string") return jsonIn;

  try {
    if (jsonIn && typeof jsonIn === "object") {
      // For completions of generations, display the generation as text
      // { completion: "<completion>" } ->  "<completion>"
      if (
        Object.keys(jsonIn).length === 1 &&
        "completion" in jsonIn &&
        typeof jsonIn.completion === "string"
      ) {
        return jsonIn.completion;
      }

      // For OpenAI ChatCompletion Prompts, concat the messages
      // [ { "role": "<role>", "content": "<content>" } ] -> "<role>\n<content>\n\n"
      if (
        Array.isArray(jsonIn) &&
        jsonIn.length > 0 &&
        typeof jsonIn[0] === "object" &&
        "role" in jsonIn[0] &&
        "content" in jsonIn[0]
      ) {
        return (jsonIn as { role: string; content: string }[])
          .map(
            (message) => `${message.role.toUpperCase()}\n\n${message.content}`,
          )
          .join("\n\n------\n\n");
      }

      // If it is an array with a single string, return the string
      // [ "<string>" ] -> "<string>"
      if (
        Array.isArray(jsonIn) &&
        jsonIn.length === 1 &&
        typeof jsonIn[0] === "string"
      ) {
        return jsonIn[0];
      }

      // If it is an Object with a single key, listed in the list of keys, return the value if it is a string
      // { "<key>": "<string>" } -> "<string>"
      const keys = ["input", "output", "text", "prompt"];
      if (
        Object.keys(jsonIn).length === 1 &&
        keys.includes(Object.keys(jsonIn)[0] as string) &&
        typeof Object.values(jsonIn)[0] === "string"
      ) {
        return Object.values(jsonIn)[0] as string;
      }
    }
  } catch (e) {
    console.error("Error while trying to parse the string", e, jsonIn);
  }

  return JSON.stringify(jsonIn, null, 2);
};

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
