"use client";

import { deepParseJson } from "@langfuse/shared";
import { useMemo, useState } from "react";
import { Code2 } from "lucide-react";
import { CodeBlock } from "@/src/components/design-system/Codeblock/Codeblock";
import { Button } from "@/src/components/ui/button";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";

const SOURCE_CODE_PLACEHOLDER = "__langfuseInAppAgentSourceCodePath";

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
        value: unwrapMcpTextResult(parsedValue),
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
  const codes = useMemo(() => findEvaluatorSourceCodes(value), [value]);
  const jsonValue = useMemo(
    () => replaceEvaluatorSourceCodes(value, codes),
    [value, codes],
  );
  const [activeCode, setActiveCode] = useState<PayloadCode | null>(null);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="max-h-64 min-h-0 overflow-y-auto">
        <JSONView
          json={jsonValue}
          isLoading={false}
          borderless
          codeClassName="rounded-md bg-muted p-2"
          collapseDepth={4}
          externalJsonCollapsed={activeCode !== null}
          onToggleCollapse={() => {
            setActiveCode(null);
          }}
          customizeNode={({ node }) => {
            const code = getPlaceholderSourceCode(node, codes);

            return code ? (
              <EvaluatorSourceCodeValue
                code={code}
                onShowCode={() => {
                  setActiveCode(code);
                }}
              />
            ) : undefined;
          }}
        />
      </div>
      {activeCode ? (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">
                {activeCode.label}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                onClick={() => {
                  setActiveCode(null);
                }}
              >
                Expand JSON
              </button>
            </div>
            <code
              className="text-muted-foreground min-w-0 truncate font-mono text-xs"
              title={activeCode.path}
            >
              Path: {activeCode.path}
            </code>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <CodeBlock
              language={activeCode.language}
              value={activeCode.value}
              variant="read-only"
              borderless
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function replaceEvaluatorSourceCodes(value: unknown, codes: PayloadCode[]) {
  if (codes.length === 0) {
    return value;
  }

  return replaceEvaluatorSourceCodesRecursive(
    value,
    new Map(codes.map((code) => [code.path, code])),
    0,
    "",
  );
}

function replaceEvaluatorSourceCodesRecursive(
  value: unknown,
  codesByPath: Map<string, PayloadCode>,
  depth: number,
  path: string,
): unknown {
  if (depth > 6) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trimStart();
    if (
      value.length > 500_000 ||
      (trimmedValue[0] !== "{" && trimmedValue[0] !== "[")
    ) {
      return value;
    }

    const nestedValue = deepParseJson(value, { maxDepth: 1 });
    return nestedValue === value
      ? value
      : replaceEvaluatorSourceCodesRecursive(
          nestedValue,
          codesByPath,
          depth + 1,
          path,
        );
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      replaceEvaluatorSourceCodesRecursive(
        entry,
        codesByPath,
        depth + 1,
        appendJsonPath(path, index),
      ),
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  const replacement: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = appendJsonPath(path, key);
    Object.defineProperty(replacement, key, {
      configurable: true,
      enumerable: true,
      value: codesByPath.has(nestedPath)
        ? { [SOURCE_CODE_PLACEHOLDER]: nestedPath }
        : replaceEvaluatorSourceCodesRecursive(
            nestedValue,
            codesByPath,
            depth + 1,
            nestedPath,
          ),
      writable: true,
    });
  }

  return replacement;
}

function getPlaceholderSourceCode(value: unknown, codes: PayloadCode[]) {
  if (!isRecord(value)) {
    return undefined;
  }

  const path = value[SOURCE_CODE_PLACEHOLDER];
  return typeof path === "string"
    ? codes.find((code) => code.path === path)
    : undefined;
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
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="bg-surface-code text-muted-foreground hover:bg-border hover:text-foreground relative top-px ml-1 gap-1 text-xs"
        onClick={(event) => {
          event.stopPropagation();
          onShowCode();
        }}
      >
        <Code2 className="size-3" aria-hidden="true" />
        Show in code block
      </Button>
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

function findEvaluatorSourceCodes(value: unknown): PayloadCode[] {
  return findEvaluatorSourceCodesRecursive(value, 0, "");
}

function findEvaluatorSourceCodesRecursive(
  value: unknown,
  depth: number,
  path: string,
): PayloadCode[] {
  if (depth > 6) {
    return [];
  }

  if (typeof value === "string") {
    const trimmedValue = value.trimStart();
    if (
      value.length > 500_000 ||
      (trimmedValue[0] !== "{" && trimmedValue[0] !== "[")
    ) {
      return [];
    }

    const nestedValue = deepParseJson(value, { maxDepth: 1 });

    return nestedValue === value
      ? []
      : findEvaluatorSourceCodesRecursive(nestedValue, depth + 1, path);
  }

  if (Array.isArray(value)) {
    let codes: PayloadCode[] = [];
    for (const [index, entry] of value.entries()) {
      codes = codes.concat(
        findEvaluatorSourceCodesRecursive(
          entry,
          depth + 1,
          appendJsonPath(path, index),
        ),
      );
    }

    return codes;
  }

  if (!isRecord(value)) {
    return [];
  }

  let codes = readEvaluatorSourceCodes(value, path);

  for (const [key, nestedValue] of Object.entries(value)) {
    codes = codes.concat(
      findEvaluatorSourceCodesRecursive(
        nestedValue,
        depth + 1,
        appendJsonPath(path, key),
      ),
    );
  }

  return codes;
}

function readEvaluatorSourceCodes(
  value: Record<string, unknown>,
  path: string,
) {
  if (value.type !== "CODE") {
    return [];
  }

  const directCode = readEvaluatorSourceCodeFields(value, path);
  let codes = directCode ? [directCode] : [];

  if (Array.isArray(value.versions)) {
    for (const [index, version] of value.versions.entries()) {
      if (!isRecord(version)) {
        continue;
      }

      const versionCode = readEvaluatorSourceCodeFields(
        version,
        appendJsonPath(appendJsonPath(path, "versions"), index),
      );
      if (versionCode) {
        codes.push(versionCode);
      }
    }
  }

  return codes;
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
