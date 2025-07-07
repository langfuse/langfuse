import { cn } from "@/src/utils/tailwind";
import {
  type FC,
  type ReactNode,
  type ReactElement,
  memo,
  isValidElement,
  Children,
  createElement,
} from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import Link from "next/link";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/src/components/ui/Codeblock";
import { useTheme } from "next-themes";
import { ImageOff, Info } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useMarkdownContext } from "@/src/features/theming/useMarkdownContext";
import { type ExtraProps as ReactMarkdownExtraProps } from "react-markdown";
import {
  OpenAIUrlImageUrl,
  MediaReferenceStringSchema,
  type OpenAIContentParts,
  type OpenAIContentSchema,
  type OpenAIOutputAudioType,
  isOpenAITextContentPart,
  isOpenAIImageContentPart,
} from "@/src/components/schemas/ChatMlSchema";
import { type z } from "zod/v4";
import { ResizableImage } from "@/src/components/ui/resizable-image";
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { type MediaReturnType } from "@/src/features/media/validation";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import DOMPurify from "dompurify";

type ReactMarkdownNode = ReactMarkdownExtraProps["node"];
type ReactMarkdownNodeChildren = Exclude<
  ReactMarkdownNode,
  undefined
>["children"];

// ReactMarkdown does not render raw HTML by default for security reasons, to prevent XSS (Cross-Site Scripting) attacks.
// html is rendered as plain text by default.
const MemoizedReactMarkdown: FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className,
);

const getSafeUrl = (href: string | undefined | null): string | null => {
  if (!href || typeof href !== "string") return null;

  // DOMPurify's default sanitization is quite permissive but safe
  // It blocks javascript:, data: with scripts, vbscript:, etc.
  // But allows http:, https:, ftp:, mailto:, tel:, and many others
  try {
    const sanitized = DOMPurify.sanitize(href, {
      // ALLOWED_TAGS: An array of HTML tags that are explicitly permitted in the output.
      // Setting this to an empty array means that no HTML tags are allowed.
      // Any HTML tag found within the 'href' string would be stripped out.
      ALLOWED_TAGS: [],

      // ALLOWED_ATTR: An array of HTML attributes that are explicitly permitted on allowed tags.
      // Setting this to an empty array means that no HTML attributes are allowed.
      // Similar to ALLOWED_TAGS, this ensures that if any attributes are somehow
      // embedded within the URL string (e.g., malformed or attempting injection),
      // they will be removed by DOMPurify. We only expect a pure URL string.
      ALLOWED_ATTR: [],
    });

    return sanitized || null;
  } catch (error) {
    return null;
  }
};

const isTextElement = (child: ReactNode): child is ReactElement =>
  isValidElement(child) &&
  typeof child.type !== "string" &&
  ["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.type.name);

const isChecklist = (children: ReactNode) =>
  Array.isArray(children) &&
  children.some((child: any) => child?.props?.className === "task-list-item");

const transformListItemChildren = (children: ReactNode) =>
  Children.map(children, (child) =>
    isTextElement(child) ? (
      <div className="mb-1 inline-flex">
        {createElement(child.type, { ...child.props })}
      </div>
    ) : (
      child
    ),
  );

const isImageNode = (node?: ReactMarkdownNode): boolean =>
  !!node &&
  Array.isArray(node.children) &&
  node.children.some(
    (child: ReactMarkdownNodeChildren[number]) =>
      "tagName" in child && child.tagName === "img",
  );

function MarkdownRenderer({
  markdown,
  theme,
  className,
  customCodeHeaderClassName,
}: {
  markdown: string;
  theme?: string;
  className?: string;
  customCodeHeaderClassName?: string;
}) {
  // Try to parse markdown content

  try {
    // If parsing succeeds, render with ReactMarkdown
    return (
      <MemoizedReactMarkdown
        className={cn(
          "space-y-2 overflow-x-auto break-words text-sm",
          className,
        )}
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children, node }) {
            if (isImageNode(node)) {
              return <>{children}</>;
            }
            return (
              <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>
            );
          },
          a({ children, href }) {
            const safeHref = getSafeUrl(href);
            if (safeHref) {
              return (
                <Link
                  href={safeHref}
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </Link>
              );
            }
            return (
              <span className="text-muted-foreground underline">
                {children}
              </span>
            );
          },
          ul({ children }) {
            if (isChecklist(children))
              return <ul className="list-none">{children}</ul>;

            return <ul className="list-inside list-disc">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-inside list-decimal">{children}</ol>;
          },
          li({ children }) {
            return (
              <li className="mt-1 [&>ol]:pl-4 [&>ul]:pl-4">
                {transformListItemChildren(children)}
              </li>
            );
          },
          pre({ children }) {
            return <pre className="rounded p-2">{children}</pre>;
          },
          h1({ children }) {
            return <h1 className="text-2xl font-bold">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-xl font-bold">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-lg font-bold">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="text-base font-bold">{children}</h4>;
          },
          h5({ children }) {
            return <h5 className="text-sm font-bold">{children}</h5>;
          },
          h6({ children }) {
            return <h6 className="text-xs font-bold">{children}</h6>;
          },
          code({ children, className }) {
            const languageMatch = /language-(\w+)/.exec(className || "");
            const language = languageMatch ? languageMatch[1] : "";
            const codeContent = String(children).replace(/\n$/, "");
            const isMultiLine = codeContent.includes("\n");

            return language || isMultiLine ? (
              // code block
              <CodeBlock
                key={Math.random()}
                language={language}
                value={codeContent}
                theme={theme}
                className={customCodeHeaderClassName}
              />
            ) : (
              // inline code
              <code className="rounded border bg-secondary px-0.5">
                {codeContent}
              </code>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 pl-4 italic">
                {children}
              </blockquote>
            );
          },
          img({ src, alt }) {
            return src ? <ResizableImage src={src} alt={alt} /> : null;
          },
          hr() {
            return <hr className="my-4" />;
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto rounded border text-xs">
                <table className="min-w-full divide-y">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead>{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-border">{children}</tbody>;
          },
          tr({ children }) {
            return <tr>{children}</tr>;
          },
          th({ children }) {
            return (
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="whitespace-nowrap px-4 py-2">{children}</td>;
          },
        }}
      >
        {markdown}
      </MemoizedReactMarkdown>
    );
  } catch (error) {
    // fallback to JSON view if markdown parsing fails

    return (
      <>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          Markdown parsing failed. Displaying raw JSON.
        </div>
        <JSONView json={markdown} className="min-w-0" />
      </>
    );
  }
}
const parseOpenAIContentParts = (
  content: z.infer<typeof OpenAIContentParts> | null,
): string => {
  return (content ?? [])
    .map((item) => {
      if (item.type === "text") {
        return item.text;
      } else if (item.type === "image_url") {
        return `![image](${item.image_url.url})`;
      } else if (item.type === "input_audio") {
        return `![audio](${item.input_audio.data})`;
      }
    })
    .join("\n");
};

export function MarkdownView({
  markdown,
  title,
  customCodeHeaderClassName,
  audio,
  media,
}: {
  markdown: string | z.infer<typeof OpenAIContentSchema>;
  title?: string;
  customCodeHeaderClassName?: string;
  audio?: OpenAIOutputAudioType;
  media?: MediaReturnType[];
}) {
  const capture = usePostHogClientCapture();
  const { resolvedTheme: theme } = useTheme();
  const { setIsMarkdownEnabled } = useMarkdownContext();

  const handleOnCopy = () => {
    const rawText =
      typeof markdown === "string"
        ? markdown
        : parseOpenAIContentParts(markdown);
    void copyTextToClipboard(rawText);
  };

  const handleOnValueChange = () => {
    setIsMarkdownEnabled(false);
    capture("trace_detail:io_pretty_format_toggle_group", {
      renderMarkdown: false,
    });
  };

  return (
    <div className={cn("overflow-hidden")} key={theme}>
      {title ? (
        <MarkdownJsonViewHeader
          title={title}
          handleOnValueChange={handleOnValueChange}
          handleOnCopy={handleOnCopy}
        />
      ) : null}
      <div
        className={cn(
          "grid grid-flow-row gap-2 rounded-sm border p-3",
          title === "assistant" || title === "Output"
            ? "bg-accent-light-green dark:border-accent-dark-green"
            : "",
          title === "system" || title === "Input"
            ? "bg-primary-foreground"
            : "",
        )}
      >
        {typeof markdown === "string" ? (
          // plain string
          <MarkdownRenderer
            markdown={markdown}
            theme={theme}
            customCodeHeaderClassName={customCodeHeaderClassName}
          />
        ) : (
          // content parts (multi-modal)
          (markdown ?? []).map((content, index) =>
            isOpenAITextContentPart(content) ? (
              <MarkdownRenderer
                key={index}
                markdown={content.text}
                theme={theme}
                customCodeHeaderClassName={customCodeHeaderClassName}
              />
            ) : isOpenAIImageContentPart(content) ? (
              OpenAIUrlImageUrl.safeParse(content.image_url.url).success ? (
                <div key={index}>
                  <ResizableImage src={content.image_url.url.toString()} />
                </div>
              ) : MediaReferenceStringSchema.safeParse(content.image_url.url)
                  .success ? (
                <LangfuseMediaView
                  mediaReferenceString={content.image_url.url}
                />
              ) : (
                <div className="grid grid-cols-[auto,1fr] items-center gap-2">
                  <span title="<Base64 data URI>" className="h-4 w-4">
                    <ImageOff className="h-4 w-4" />
                  </span>
                  <span className="truncate text-sm">
                    {content.image_url.url.toString()}
                  </span>
                </div>
              )
            ) : content.type === "input_audio" ? (
              <LangfuseMediaView
                mediaReferenceString={content.input_audio.data}
              />
            ) : null,
          )
        )}
        {audio ? (
          <>
            <MarkdownRenderer
              markdown={audio.transcript ? "[Audio] \n" + audio.transcript : ""}
              theme={theme}
              customCodeHeaderClassName={customCodeHeaderClassName}
            />
            <LangfuseMediaView
              mediaReferenceString={audio.data.referenceString}
            />
          </>
        ) : null}
      </div>
      {media && media.length > 0 && (
        <>
          <div className="mx-3 border-t px-2 py-1 text-xs text-muted-foreground">
            Media
          </div>
          <div className="flex flex-wrap gap-2 p-4 pt-1">
            {media.map((m) => (
              <LangfuseMediaView
                mediaAPIReturnValue={m}
                asFileIcon={true}
                key={m.mediaId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
