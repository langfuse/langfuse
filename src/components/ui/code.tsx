import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { default as React18JsonView } from "react18-json-view";

export function JSONView(props: {
  json: unknown;
  title?: string;
  className?: string;
}) {
  const isCompletion =
    props.json &&
    typeof props.json === "object" &&
    Object.keys(props.json).length === 1 &&
    "completion" in props.json &&
    typeof props.json.completion === "string";

  // some users ingest stringified json, parse it
  const json = isCompletion
    ? parseJson((props.json as { completion: string }).completion)
    : props.json;

  // some users ingest stringified json nested in json, parse it
  const parsedJson = deepParseJson(json);

  return (
    <div className={cn("max-w-full rounded-md border ", props.className)}>
      {props.title ? (
        <div className="border-b px-4 py-1 text-xs font-medium">
          {props.title}
        </div>
      ) : undefined}
      <div className="flex gap-2 whitespace-pre-wrap p-3 text-xs">
        <React18JsonView
          src={parsedJson}
          theme="github"
          collapseObjectsAfterLength={20}
          collapseStringsAfterLength={500}
          displaySize={"collapsed"}
        />
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

const parseJson = (input: string) => {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
};

/**
 * Deeply parses a JSON string or object for nested stringified JSON
 * @param json JSON string or object to parse
 * @returns Parsed JSON object
 */
function deepParseJson(json: unknown): unknown {
  if (typeof json === "string") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(json);
      return deepParseJson(parsed); // Recursively parse parsed value
    } catch (e) {
      return json; // If it's not a valid JSON string, just return the original string
    }
  } else if (typeof json === "object" && json !== null) {
    // Handle arrays
    if (Array.isArray(json)) {
      for (let i = 0; i < json.length; i++) {
        json[i] = deepParseJson(json[i]);
      }
    } else {
      // Handle nested objects
      for (const key in json) {
        // Ensure we only iterate over the object's own properties
        if (Object.prototype.hasOwnProperty.call(json, key)) {
          (json as Record<string, unknown>)[key] = deepParseJson(
            (json as Record<string, unknown>)[key],
          );
        }
      }
    }
    return json;
  }

  return json;
}
