"use client";

import { useMemo, useState } from "react";
import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import {
  prepareToolPayload,
  unwrapMcpTextResult,
} from "./tool-payload-renderers";

type ParsedToolPayload =
  | { state: "json"; value: unknown }
  | { state: "raw"; value: string };

export function InAppAgentToolPayload({
  label,
  value,
  variant,
  toolName,
  kind,
}: {
  label: string;
  toolName?: string;
  kind: "arguments" | "result";
  value: string;
  variant: "default" | "failed" | "denied";
}) {
  const payload = useMemo<ParsedToolPayload>(() => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return { state: "json", value: {} };
    }

    try {
      const parsedValue = JSON.parse(trimmedValue) as unknown;

      return {
        state: "json",
        value: unwrapMcpTextResult(parsedValue),
      };
    } catch {
      return { state: "raw", value };
    }
  }, [value]);

  const content =
    payload.state === "json" ? (
      <StructuredToolPayload
        key={toolName}
        label={label}
        value={payload.value}
        toolName={toolName}
        kind={kind}
      />
    ) : (
      <pre
        className={cn(
          "max-h-64 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap",
          variant === "default" && "bg-muted text-muted-foreground",
          variant === "failed" && "bg-destructive/10 text-destructive",
          variant === "denied" && "bg-light-yellow text-dark-yellow",
        )}
      >
        {payload.value}
      </pre>
    );

  return (
    <div className="ph-no-capture space-y-1">
      {payload.state === "raw" ? (
        <p
          className={cn(
            "text-xs font-bold",
            variant === "default" && "text-muted-foreground",
            variant === "failed" && "text-destructive",
            variant === "denied" && "text-dark-yellow",
          )}
        >
          {label}
        </p>
      ) : null}
      {content}
    </div>
  );
}

function StructuredToolPayload({
  label,
  value,
  toolName,
  kind,
}: {
  label: string;
  value: unknown;
  toolName: string | undefined;
  kind: "arguments" | "result";
}) {
  const { json, codes, markers } = useMemo(
    () => prepareToolPayload(value, toolName, kind),
    [value, toolName, kind],
  );
  // undefined selects the first field; null displays the JSON tree.
  const [selectedPath, setSelectedPath] = useState<string | null>();
  const code =
    selectedPath === null
      ? undefined
      : (codes.get(selectedPath ?? "") ?? codes.values().next().value);

  if (!code) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-muted-foreground text-xs font-bold">{label}</p>
        <JSONView
          json={json}
          preserveStrings
          borderless
          codeClassName="max-h-64 overflow-auto rounded-md bg-muted p-2"
          collapseDepth={4}
          customizeNode={(node) => {
            const field =
              typeof node === "object" && node !== null
                ? markers.get(node)
                : undefined;
            return field ? (
              <button
                type="button"
                className="text-primary cursor-pointer underline underline-offset-2"
                aria-label={`View as code: ${field.path}`}
                onClick={() => {
                  setSelectedPath(field.path);
                }}
              >
                View as code
              </button>
            ) : undefined;
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-bold">{label}</p>
        <button
          type="button"
          className="text-muted-foreground cursor-pointer text-xs underline underline-offset-2"
          onClick={() => {
            setSelectedPath(null);
          }}
        >
          View JSON
        </button>
      </div>
      <section aria-label={code.path} className="flex min-w-0 flex-col gap-1">
        <p className="text-muted-foreground font-mono text-xs break-all">
          {code.path}
        </p>
        <div className="max-h-64 overflow-auto rounded-md border">
          <CodeBlock language={code.language} value={code.value} borderless />
        </div>
      </section>
    </div>
  );
}
