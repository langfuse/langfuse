import { cn } from "@/src/utils/tailwind";
import { type FC, memo, type ReactNode, useState } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import Link from "next/link";
import DOMPurify from "dompurify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "@/src/components/ui/Codeblock";
import { useTheme } from "next-themes";
import { Button } from "@/src/components/ui/button";
import { Check, Copy } from "lucide-react";

const MemoizedReactMarkdown: FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className,
);

const isChecklist = (children: ReactNode) =>
  Array.isArray(children) &&
  children.some((child: any) => child?.props?.className === "task-list-item");

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

  const sanitizedMarkdown = DOMPurify.sanitize(markdown);

  const handleCopy = () => {
    setIsCopied(true);
    void navigator.clipboard.writeText(markdown);
    setTimeout(() => setIsCopied(false), 1000);
  };

  return (
    <div className={cn("rounded-md border", className)} key={theme}>
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
          <Button
            title="Copy to clipboard"
            variant="ghost"
            size="xs"
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
      ) : undefined}
      <MemoizedReactMarkdown
        className={cn("space-y-4 break-words p-3 font-mono text-xs", className)}
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
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

            return <ul className="list-inside list-disc pl-2">{children}</ul>;
          },
          ol({ children }) {
            return (
              <ol className="list-inside list-decimal pl-2">{children}</ol>
            );
          },
          li({ children }) {
            return <li className="mb-1">{children}</li>;
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
            const match = /language-(\w+)/.exec(className || "");

            return match ? (
              <CodeBlock
                key={Math.random()}
                language={match[1] || ""}
                value={String(children).replace(/\n$/, "")}
                theme={theme}
                className={customCodeHeaderClassName}
              />
            ) : (
              <code>{children}</code>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 pl-4 italic">
                {children}
              </blockquote>
            );
          },
          img({ src }) {
            return (
              <Link href={src ?? ""} className="underline" target="_blank">
                {src ?? ""}
              </Link>
            );
          },
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
        {sanitizedMarkdown}
      </MemoizedReactMarkdown>
    </div>
  );
}
