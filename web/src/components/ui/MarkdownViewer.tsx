import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { cn } from "@/src/utils/tailwind";
import { useMemo } from "react";
import Markdown from "react-markdown";

export function MarkdownView(props: {
  markdown: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border", props.className)}>
      {props.title ? (
        <div
          className={cn(
            // props.title === "assistant" || props.title === "Output"
            //   ? "dark:border-accent-dark-green"
            //   : "",
            "border-b px-3 py-1 text-xs font-medium",
          )}
        >
          {props.title}
        </div>
      ) : undefined}
      <div className={cn("p-3 text-xs")}>
        <Markdown>{props.markdown}</Markdown>
      </div>
    </div>
  );
}

export function MarkdownOrJsonView(props: {
  text?: unknown;
  title?: string;
  className?: string;
}) {
  const isMarkdown = useMemo(
    () => checkForMarkdown(props.text ?? ""),
    [props.text],
  );

  return isMarkdown ? (
    <MarkdownView
      markdown={props.text as string} // is always string -> otherwise not isMarkdown
      title={props.title}
      className={props.className}
    />
  ) : (
    <JSONView
      json={props.text}
      title={props.title}
      className={props.className}
    />
  );
}

// TODO: Add unit tests for this function
export function containsMarkdown(text: unknown): boolean {
  // in case this is an object or something else
  if (typeof text !== "string") {
    return false;
  }

  const markdownRegex =
    /(\*\*|__)(.*?)\1|`{3}[\s\S]*?`{3}|`[\s\S]*?`|\s*^[-*+]\s|^\s*#{1,6}\s|!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)/gm;
  return markdownRegex.test(text);
}

export function checkForMarkdown(...texts: unknown[]): boolean {
  return texts.some((text) => containsMarkdown(text));
}
