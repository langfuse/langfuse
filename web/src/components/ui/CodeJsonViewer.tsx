import { useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FoldVertical,
  UnfoldVertical,
} from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { default as React18JsonView } from "react18-json-view";
import "react18-json-view/src/dark.css";
import { deepParseJson } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useTheme } from "next-themes";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useMarkdownContext } from "@/src/features/theming/useMarkdownContext";
import { type MediaReturnType } from "@/src/features/media/validation";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { renderRichPromptContent } from "@/src/features/prompts/components/prompt-content-utils";
import { copyTextToClipboard } from "@/src/utils/clipboard";

export const IO_TABLE_CHAR_LIMIT = 10000;

export function JSONView(props: {
  canEnableMarkdown?: boolean;
  json?: unknown;
  title?: string;
  hideTitle?: boolean;
  className?: string;
  isLoading?: boolean;
  codeClassName?: string;
  collapseStringsAfterLength?: number | null;
  media?: MediaReturnType[];
  scrollable?: boolean;
  projectIdForPromptButtons?: string;
  controlButtons?: React.ReactNode;
  externalJsonCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  // some users ingest stringified json nested in json, parse it
  const parsedJson = useMemo(() => deepParseJson(props.json), [props.json]);
  const { resolvedTheme } = useTheme();
  const { setIsMarkdownEnabled } = useMarkdownContext();
  const capture = usePostHogClientCapture();
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const collapseStringsAfterLength =
    props.collapseStringsAfterLength === null
      ? 100_000_000 // if null, show all (100M chars)
      : (props.collapseStringsAfterLength ?? 500);

  const isCollapsed = props.externalJsonCollapsed ?? internalCollapsed;

  const handleOnCopy = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.preventDefault();
    }
    const textToCopy = stringifyJsonNode(parsedJson);
    void copyTextToClipboard(textToCopy);

    // Keep focus on the copy button to prevent focus shifting
    if (event) {
      event.currentTarget.focus();
    }
  };

  const handleOnValueChange = () => {
    setIsMarkdownEnabled(true);
    capture("trace_detail:io_pretty_format_toggle_group", {
      renderMarkdown: true,
    });
  };

  const handleToggleCollapse = () => {
    if (props.onToggleCollapse) {
      props.onToggleCollapse();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  const body = (
    <>
      <div
        className={cn(
          "flex gap-2 whitespace-pre-wrap break-words p-3 text-xs",
          props.title === "assistant" || props.title === "Output"
            ? "bg-accent-light-green dark:border-accent-dark-green"
            : "",
          props.title === "system" || props.title === "Input"
            ? "bg-primary-foreground"
            : "",
          props.scrollable ? "" : "rounded-sm border",
          props.codeClassName,
        )}
      >
        {props.isLoading ? (
          <Skeleton className="h-3 w-3/4" />
        ) : props.projectIdForPromptButtons ? (
          <code className="whitespace-pre-wrap break-words">
            {renderRichPromptContent(
              props.projectIdForPromptButtons,
              String(parsedJson),
            )}
          </code>
        ) : (
          <React18JsonView
            src={parsedJson}
            theme="github"
            dark={resolvedTheme === "dark"}
            collapsed={isCollapsed ? 1 : false}
            collapseObjectsAfterLength={isCollapsed ? 0 : 20}
            collapseStringsAfterLength={collapseStringsAfterLength}
            collapseStringMode="word"
            customizeCollapseStringUI={(fullSTring, truncated) =>
              truncated ? (
                <div className="opacity-50">{`\n...expand (${Math.max(fullSTring.length - collapseStringsAfterLength, 0)} more characters)`}</div>
              ) : (
                ""
              )
            }
            displaySize={isCollapsed ? "collapsed" : "expanded"}
            matchesURL={true}
            customizeCopy={(node) => stringifyJsonNode(node)}
            className="w-full"
          />
        )}
      </div>
      {props.media && props.media.length > 0 && (
        <>
          <div className="mx-3 border-t px-2 py-1 text-xs text-muted-foreground">
            Media
          </div>
          <div className="flex flex-wrap gap-2 p-4 pt-1">
            {props.media.map((m) => (
              <LangfuseMediaView
                mediaAPIReturnValue={m}
                asFileIcon={true}
                key={m.mediaId}
              />
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex max-h-full min-h-0 flex-col",
        props.className,
        props.scrollable ? "overflow-hidden" : "",
      )}
    >
      {props.title && !props.hideTitle ? (
        <MarkdownJsonViewHeader
          title={props.title}
          canEnableMarkdown={props.canEnableMarkdown ?? false}
          handleOnValueChange={handleOnValueChange}
          handleOnCopy={handleOnCopy}
          controlButtons={
            <>
              {props.controlButtons}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleToggleCollapse}
                className="-mr-2 hover:bg-border"
                title={isCollapsed ? "Expand all" : "Collapse all"}
              >
                {isCollapsed ? (
                  <UnfoldVertical className="h-3 w-3" />
                ) : (
                  <FoldVertical className="h-3 w-3" />
                )}
              </Button>
            </>
          }
        />
      ) : null}
      {props.scrollable ? (
        <div className="flex h-full min-h-0 overflow-hidden rounded-sm border">
          <div className="max-h-full min-h-0 w-full overflow-y-auto">
            {body}
          </div>
        </div>
      ) : (
        body
      )}
    </div>
  );
}

export function CodeView(props: {
  content: string | React.ReactNode[] | undefined | null;
  originalContent?: string;
  className?: string;
  defaultCollapsed?: boolean;
  title?: string;
  scrollable?: boolean;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setCollapsed] = useState(props.defaultCollapsed);

  const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsCopied(true);
    const content =
      props.originalContent ??
      (typeof props.content === "string"
        ? props.content
        : (props.content?.join("\n") ?? ""));
    void copyTextToClipboard(content);
    setTimeout(() => setIsCopied(false), 1000);

    // Keep focus on the copy button to prevent focus shifting
    event.currentTarget.focus();
  };

  const handleShowAll = () => setCollapsed(!isCollapsed);

  return (
    <div
      className={cn(
        "flex max-w-full flex-col",
        props.className,
        props.scrollable && "max-h-full min-h-0",
      )}
    >
      <>
        {props.title ? (
          <div className="my-1 flex flex-shrink-0 items-center justify-between pl-1">
            <div className="text-sm font-medium">{props.title}</div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopy}
              className=""
            >
              {isCopied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        ) : undefined}
      </>
      <div
        className={cn(
          "relative flex flex-col gap-2 rounded-md border",
          props.scrollable ? "max-h-full min-h-0 overflow-hidden" : "",
        )}
      >
        {!props.title && (
          <Button
            variant="secondary"
            size="icon-xs"
            onClick={handleCopy}
            className="absolute right-2 top-2 z-10"
          >
            {isCopied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}
        <code
          className={cn(
            "relative flex-1 whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs",
            isCollapsed ? `line-clamp-6` : "block",
            props.scrollable ? "overflow-y-auto" : "",
          )}
        >
          {props.content}
        </code>
        {props.defaultCollapsed ? (
          <div className="flex gap-2 py-2 pr-2">
            <Button variant="secondary" size="xs" onClick={handleShowAll}>
              {isCollapsed ? (
                <ChevronsUpDown className="h-3 w-3" />
              ) : (
                <ChevronsDownUp className="h-3 w-3" />
              )}
            </Button>
          </div>
        ) : undefined}
      </div>
    </div>
  );
}

export const JsonSkeleton = ({
  className,
  numRows = 10,
}: {
  numRows?: number;
  className?: string;
}) => {
  return (
    <div className={cn("w-[400px] rounded-md border", className)}>
      <div className="flex flex-col gap-1">
        {[...Array<number>(numRows)].map((_, i) => (
          <Skeleton
            className={cn(
              "h-4 w-full",
              i === numRows - 1 ? "w-3/4" : undefined,
            )}
            key={i}
          />
        ))}
      </div>
    </div>
  );
};

// TODO: deduplicate with PrettyJsonView.tsx
export function stringifyJsonNode(node: unknown) {
  // return single string nodes without quotes
  if (typeof node === "string") {
    return node;
  }

  try {
    return JSON.stringify(
      node,
      (_key, value) => {
        switch (typeof value) {
          case "bigint":
            return String(value) + "n";
          case "number":
          case "boolean":
          case "object":
          case "string":
            return value as string;
          default:
            return String(value);
        }
      },
      4,
    );
  } catch (error) {
    console.error("JSON stringify error", error);
    return "Error: JSON.stringify failed";
  }
}
