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
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import Link from "next/link";
import Image from "next/image";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "@/src/components/ui/Codeblock";
import { useTheme } from "next-themes";
import { Button } from "@/src/components/ui/button";
import { Check, Copy, ImageOff, Maximize2, Minimize2 } from "lucide-react";
import { api } from "@/src/utils/api";
import { isPresent } from "@/src/utils/typeChecks";
import { BsMarkdown } from "react-icons/bs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useMarkdownContext } from "@/src/features/theming/useMarkdownContext";
import { captureException } from "@sentry/nextjs";

// ReactMarkdown does not render raw HTML by default for security reasons, to prevent XSS (Cross-Site Scripting) attacks.
// html is rendered as plain text by default.
const MemoizedReactMarkdown: FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className,
);

const isChecklist = (children: ReactNode) =>
  Array.isArray(children) &&
  children.some((child: any) => child?.props?.className === "task-list-item");

/**
 * Implemented customLoader as we cannot whitelist user provided image domains
 * Security risks are taken care of by a validation in api.utilities.validateImgUrl
 * Fetching image will fail if SSL/TLS certificate is invalid or expired, will be handled by onError
 * Do not use this customLoader in production if you are not using the above mentioned security measures */
const customLoader = ({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) => {
  return `${src}?w=${width}&q=${quality || 75}`;
};

const ImageErrorDisplay = ({
  src,
  errorDescription,
}: {
  src: string;
  errorDescription: string;
}) => (
  <div className="flex flex-row items-center gap-2">
    <span title={errorDescription} className="h-4 w-4">
      <ImageOff className="h-4 w-4" />
    </span>
    <Link href={src} className="underline" target="_blank">
      {src}
    </Link>
  </div>
);

const MarkdownImage: Components["img"] = ({ src, alt }) => {
  const [isZoomedIn, setIsZoomedIn] = useState(true);
  const [hasFetchError, setHasFetchError] = useState(false);

  if (!isPresent(src)) return null;

  const isValidImage = api.utilities.validateImgUrl.useQuery(src);
  if (isValidImage.isLoading) {
    return (
      <Skeleton className="h-8 w-1/2 items-center p-2 text-xs">
        <span className="opacity-80">Loading image...</span>
      </Skeleton>
    );
  }

  const errorDescription =
    "Cannot load image. Http images are not rendered in Langfuse for security reasons";

  if (isValidImage.data?.isValid) {
    return (
      <div>
        {hasFetchError ? (
          <ImageErrorDisplay src={src} errorDescription={errorDescription} />
        ) : (
          <div
            className={cn(
              "group relative w-full overflow-hidden rounded border",
              isZoomedIn ? "h-1/2 w-1/2" : "h-full w-full",
            )}
          >
            <Image
              loader={customLoader}
              src={src}
              alt={alt ?? `Markdown Image-${Math.random()}`}
              loading="lazy"
              width={0}
              height={0}
              className="h-full w-full object-contain"
              onError={(error) => {
                setHasFetchError(true);
                captureException(error);
              }}
            />
            <Button
              type="button"
              className="absolute right-0 top-0 mr-1 mt-1 h-8 w-8 opacity-0 group-hover:!bg-accent/30 group-hover:opacity-100"
              variant="ghost"
              size="icon"
              onClick={() => setIsZoomedIn(!isZoomedIn)}
            >
              {isZoomedIn ? (
                <Maximize2 className="h-4 w-4"></Maximize2>
              ) : (
                <Minimize2 className="h-4 w-4"></Minimize2>
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return <ImageErrorDisplay src={src} errorDescription={errorDescription} />;
};

const isTextElement = (child: ReactNode): child is ReactElement =>
  isValidElement(child) &&
  typeof child.type !== "string" &&
  ["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.type.name);

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

export function MarkdownView({
  markdown,
  title,
  className,
  customCodeHeaderClassName,
}: {
  markdown: string;
  title?: string;
  className?: string;
  customCodeHeaderClassName?: string;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const { resolvedTheme: theme } = useTheme();
  const capture = usePostHogClientCapture();
  const { setIsMarkdownEnabled } = useMarkdownContext();

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(markdown);
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
      ) : undefined}
      <MemoizedReactMarkdown
        className={cn(
          "space-y-4 overflow-x-auto break-words p-3 text-sm",
          className,
        )}
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          p({ children }) {
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
            return (
              <ol className="list-outside list-decimal pl-4">{children}</ol>
            );
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
          img: MarkdownImage,
          hr() {
            return <hr className="my-4" />;
          },
          table({ children }) {
            return (
              <div className="overflow-hidden rounded border">
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
    </div>
  );
}
