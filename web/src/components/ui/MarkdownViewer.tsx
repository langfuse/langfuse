import { MarkdownSchema } from "@/src/components/trace/IOPreview";
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
            props.title === "assistant" || props.title === "Output"
              ? "dark:border-accent-dark-green"
              : "",
            "border-b px-3 py-1 text-xs font-medium",
          )}
        >
          {props.title}
        </div>
      ) : undefined}
      <div className={cn("markdown-container p-3 text-xs")}>
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

  const validatedMarkdown = useMemo(
    () => MarkdownSchema.safeParse(props.text),
    [props.text],
  );

  return validatedMarkdown.success ? (
    <MarkdownView
      markdown={validatedMarkdown.data} // is always string -> otherwise not isMarkdown
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

export function containsMarkdown(text: string): boolean {

  const markdownRegex = new RegExp([
    '(\\*\\*?|__?)(.*?)\\1',  // Matches bold (** or __) and italic (* or _) with proper escaping
    '`{3}[\\s\\S]*?`{3}',     // Matches fenced code blocks with triple backticks
    '`[\\s\\S]*?`',           // Matches inline code with single backticks
    '(^|\\s)[-+*]\\s',        // Matches unordered lists that start with -, +, or *
    '^\\s*#{1,6}\\s',         // Matches headers that start with # to ######
    '^>\\s+',                 // Matches blockquotes starting with >
    '^\\d+\\.\\s',            // Matches ordered lists starting with 1. or 2. etc
    '!\\[.*?\\]\\(.*?\\)',    // Matches images ![Alt text](URL)
    '\\[.*?\\]\\(.*?\\)'      // Matches links [Link text](URL)
].join('|'), 'gm');  // Use global and multiline flags

return markdownRegex.test(text);
}

export function checkForMarkdown(...texts: string[]): boolean {
  return texts.some((text) => containsMarkdown(text));
}
