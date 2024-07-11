import { cn } from "@/src/utils/tailwind";
import { type FC, memo, type ReactNode } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import Link from "next/link";
import Image from "next/image";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "@/src/components/ui/Codeblock";
import { useTheme } from "next-themes";

const MemoizedReactMarkdown: FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className,
);

const isChecklist = (children: ReactNode) =>
  Array.isArray(children) &&
  children.some((child: any) => child?.props?.className === "task-list-item");

export function MarkdownView(props: {
  markdown: string;
  title?: string;
  className?: string;
}) {
  const { theme } = useTheme();

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

      <MemoizedReactMarkdown
        className={cn("space-y-4 break-words p-3 text-sm", props.className)}
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

            return <ul className="ml-4 list-disc">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="ml-4 list-decimal">{children}</ol>;
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
          code({ children, className, ...props }) {
            const match = /language-(\w+)/.exec(className || "");

            return match ? (
              <CodeBlock
                key={Math.random()}
                language={match[1] || ""}
                value={String(children).replace(/\n$/, "")}
                theme={theme}
                {...props}
              />
            ) : (
              <code className={className} {...props}>
                {children}
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
            return (
              <Image
                src={src ?? ""}
                alt={alt ?? ""}
                className="h-auto max-w-full"
              />
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
        {props.markdown}
      </MemoizedReactMarkdown>
    </div>
  );
}
