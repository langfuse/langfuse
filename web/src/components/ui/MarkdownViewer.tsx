import { cn } from "@/src/utils/tailwind";
import {
  type FC,
  type ReactNode,
  type ReactElement,
  memo,
  useState,
  isValidElement,
  Children,
  createElement,
} from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import Link from "next/link";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "@/src/components/ui/Codeblock";
import { useTheme } from "next-themes";
import { Button } from "@/src/components/ui/button";
import { Check, Copy, ImageOff } from "lucide-react";
import { BsMarkdown } from "react-icons/bs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useMarkdownContext } from "@/src/features/theming/useMarkdownContext";
import { type ExtraProps as ReactMarkdownExtraProps } from "react-markdown";
import {
  OpenAIUrlImageUrl,
  type OpenAIContentParts,
  type OpenAIContentSchema,
} from "@/src/components/schemas/ChatMlSchema";
import { type z } from "zod";
import { ResizableImage } from "@/src/components/ui/resizable-image";

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
  return (
    <MemoizedReactMarkdown
      className={cn("space-y-2 overflow-x-auto break-words text-sm", className)}
      remarkPlugins={[remarkGfm, remarkMath]}
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
          if (href)
            return (
              <Link href={href} className="underline" target="_blank">
                {children}
              </Link>
            );
        },
        ul({ children }) {
          if (isChecklist(children))
            return <ul className="list-none">{children}</ul>;

          return <ul className="list-outside list-disc pl-4">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-outside list-decimal pl-4">{children}</ol>;
        },
        li({ children }) {
          return (
            <li className="mb-1 list-item">
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
          return <ResizableImage src={src} alt={alt} />;
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
}
const parseOpenAIContentParts = (
  content: z.infer<typeof OpenAIContentParts>,
): string => {
  return content
    .map((item) => {
      if (item.type === "text") {
        return item.text;
      } else {
        return `![image](${item.image_url.url})`;
      }
    })
    .join("\n");
};

export function MarkdownView({
  markdown,
  title,
  className,
  customCodeHeaderClassName,
}: {
  markdown: string | z.infer<typeof OpenAIContentSchema>;
  title?: string;
  className?: string;
  customCodeHeaderClassName?: string;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const capture = usePostHogClientCapture();
  const { resolvedTheme: theme } = useTheme();
  const { setIsMarkdownEnabled } = useMarkdownContext();

  const handleCopy = () => {
    setIsCopied(true);
    const rawText =
      typeof markdown === "string"
        ? markdown
        : parseOpenAIContentParts(markdown);
    void navigator.clipboard.writeText(rawText);
    setTimeout(() => setIsCopied(false), 1000);
  };

  return (
    <div
      className={cn("overflow-hidden rounded-md border", className)}
      key={theme}
    >
      {title ? (
        <div
          className={cn(
            title === "assistant" || title === "Output"
              ? "dark:border-accent-dark-green"
              : "",
            "flex flex-row items-center justify-between border-b px-3 py-1 text-xs font-medium",
          )}
        >
          {title}
          <div className="flex items-center gap-1">
            <Button
              title="Disable Markdown"
              variant="ghost"
              size="xs"
              type="button"
              onClick={() => {
                setIsMarkdownEnabled(false);
                capture("trace_detail:io_pretty_format_toggle_group", {
                  renderMarkdown: false,
                });
              }}
              className="hover:bg-border"
            >
              <BsMarkdown className="h-4 w-4" />
            </Button>
            <Button
              title="Copy to clipboard"
              variant="ghost"
              size="xs"
              type="button"
              onClick={handleCopy}
              className="hover:bg-border"
            >
              {isCopied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-flow-row gap-2 p-3">
        {typeof markdown === "string" ? (
          // plain string
          <MarkdownRenderer
            markdown={markdown}
            theme={theme}
            className={className}
            customCodeHeaderClassName={customCodeHeaderClassName}
          />
        ) : (
          // content parts (multi-modal)
          markdown.map((content, index) =>
            content.type === "text" ? (
              <MarkdownRenderer
                key={index}
                markdown={content.text}
                theme={theme}
                className={className}
                customCodeHeaderClassName={customCodeHeaderClassName}
              />
            ) : OpenAIUrlImageUrl.safeParse(content.image_url.url).success ? (
              <div key={index}>
                <ResizableImage src={content.image_url.url} />
              </div>
            ) : (
              <div className="grid grid-cols-[auto,1fr] items-center gap-2">
                <span title="No Base64 image support yet" className="h-4 w-4">
                  <ImageOff className="h-4 w-4" />
                </span>
                <span className="truncate text-sm">
                  {content.image_url.url}
                </span>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
