"use client";

import { deepParseJson } from "@langfuse/shared";
import { useMemo, useState } from "react";
import { WandSparkles } from "lucide-react";
import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";

type PayloadCode = {
  language: "python" | "typescript";
  label: "Python" | "TypeScript";
  path: string;
  value: string;
};

type ParsedToolPayload =
  | { state: "json"; value: unknown }
  | { state: "raw"; value: string };

export function InAppAgentToolPayload({
  label,
  value,
  variant,
}: {
  label: string;
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
        value: deepParseJson(unwrapMcpTextResult(parsedValue), {
          maxDepth: 6,
        }),
      };
    } catch {
      return { state: "raw", value };
    }
  }, [value]);

  const content =
    payload.state === "json" ? (
      <StructuredToolPayload value={payload.value} />
    ) : (
      <pre
        className={cn(
          "max-h-80 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap",
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
      {content}
    </div>
  );
}

function unwrapMcpTextResult(value: unknown) {
  if (
    !isRecord(value) ||
    !Array.isArray(value.content) ||
    value.content.length !== 1 ||
    !isRecord(value.content[0]) ||
    value.content[0].type !== "text" ||
    typeof value.content[0].text !== "string" ||
    Object.keys(value).some((key) => key !== "content" && key !== "isError") ||
    value.isError === true
  ) {
    return value;
  }

  try {
    return JSON.parse(value.content[0].text) as unknown;
  } catch {
    return value;
  }
}

function StructuredToolPayload({ value }: { value: unknown }) {
  const code = findEvaluatorSourceCode(value);
  const [isCodeView, setIsCodeView] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <JSONView
        json={value}
        isLoading={false}
        scrollable={true}
        className="max-h-80"
        collapseDepth={4}
        externalJsonCollapsed={isCodeView}
        onToggleCollapse={() => {
          setIsCodeView(false);
        }}
        customizeNode={({ node, indexOrName }) =>
          code && indexOrName === "sourceCode" && node === code.value ? (
            <EvaluatorSourceCodeValue
              code={code}
              onShowCode={() => {
                setIsCodeView(true);
              }}
            />
          ) : undefined
        }
      />
      {code && isCodeView ? (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">
                {code.label}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                onClick={() => {
                  setIsCodeView(false);
                }}
              >
                Expand JSON
              </button>
            </div>
            <code
              className="text-muted-foreground min-w-0 truncate font-mono text-xs"
              title={code.path}
            >
              Path: {code.path}
            </code>
          </div>
          <CodeBlock
            language={code.language}
            value={code.value}
            variant="read-only"
            maxHeight="20rem"
          />
        </div>
      ) : null}
    </div>
  );
}

function EvaluatorSourceCodeValue({
  code,
  onShowCode,
}: {
  code: PayloadCode;
  onShowCode: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const previewLength = 500;
  const isTruncated = !isExpanded && code.value.length > previewLength;
  const displayedValue = isTruncated
    ? code.value.slice(0, previewLength)
    : code.value;

  return (
    <span className="inline">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground ml-1 inline-flex items-center gap-1 text-xs underline underline-offset-2"
        onClick={(event) => {
          event.stopPropagation();
          onShowCode();
        }}
      >
        <WandSparkles className="size-3" aria-hidden="true" />
        Show in code block
      </button>
      <br />
      <span>&quot;{displayedValue}&quot;</span>
      {isTruncated ? (
        <button
          type="button"
          className="text-muted-foreground ml-1 text-xs"
          onClick={(event) => {
            event.stopPropagation();
            setIsExpanded(true);
          }}
        >
          ...expand ({code.value.length - previewLength} more characters)
        </button>
      ) : null}
    </span>
  );
}

function findEvaluatorSourceCode(value: unknown): PayloadCode | null {
  return findEvaluatorSourceCodeRecursive(value, 0, "");
}

function findEvaluatorSourceCodeRecursive(
  value: unknown,
  depth: number,
  path: string,
): PayloadCode | null {
  if (depth > 6) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const code = findEvaluatorSourceCodeRecursive(
        entry,
        depth + 1,
        appendJsonPath(path, index),
      );
      if (code) {
        return code;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const code = readEvaluatorSourceCode(value, path);
  if (code) {
    return code;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedCode = findEvaluatorSourceCodeRecursive(
      nestedValue,
      depth + 1,
      appendJsonPath(path, key),
    );
    if (nestedCode) {
      return nestedCode;
    }
  }

  return null;
}

function readEvaluatorSourceCode(value: Record<string, unknown>, path: string) {
  const directCode = readEvaluatorSourceCodeFields(value, path);
  if (value.type === "CODE" && directCode) {
    return directCode;
  }

  if (value.type === "CODE" && Array.isArray(value.versions)) {
    for (const [index, version] of value.versions.entries()) {
      if (!isRecord(version)) {
        continue;
      }

      const versionCode = readEvaluatorSourceCodeFields(
        version,
        appendJsonPath(appendJsonPath(path, "versions"), index),
      );
      if (versionCode) {
        return versionCode;
      }
    }
  }

  return null;
}

function readEvaluatorSourceCodeFields(
  value: Record<string, unknown>,
  path: string,
) {
  if (
    typeof value.sourceCode !== "string" ||
    (value.sourceCodeLanguage !== "PYTHON" &&
      value.sourceCodeLanguage !== "TYPESCRIPT")
  ) {
    return null;
  }

  return {
    language: value.sourceCodeLanguage === "PYTHON" ? "python" : "typescript",
    label: value.sourceCodeLanguage === "PYTHON" ? "Python" : "TypeScript",
    path: appendJsonPath(path, "sourceCode"),
    value: value.sourceCode,
  } satisfies PayloadCode;
}

function appendJsonPath(path: string, key: string | number) {
  return typeof key === "number"
    ? `${path}[${key}]`
    : path
      ? `${path}.${key}`
      : key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
