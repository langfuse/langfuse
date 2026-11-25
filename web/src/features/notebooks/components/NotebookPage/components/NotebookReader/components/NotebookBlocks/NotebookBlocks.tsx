import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import {
  type NotebookBlock,
  type NotebookTextNode,
  type NotebookVariableValue,
} from "@/src/features/notebooks/schema";
import { assertUnreachable } from "@/src/utils/types";

type ChartBlock = Extract<NotebookBlock, { schema: "chart@1" }>;

const headings = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function renderTextNodes(nodes: NotebookTextNode[] | undefined) {
  // Text nodes have no IDs and the reader never reorders them in place.
  return nodes?.map((node, index) => (
    <Fragment key={index}>{renderTextNode(node)}</Fragment>
  ));
}

function renderTextNode(node: NotebookTextNode): ReactNode {
  if (node.type === "paragraph") return <p>{renderTextNodes(node.content)}</p>;
  if (node.type === "heading") {
    const Heading = headings[node.attrs.level - 1] ?? "h2";
    return <Heading>{renderTextNodes(node.content)}</Heading>;
  }
  if (node.type === "blockquote") {
    return <blockquote>{renderTextNodes(node.content)}</blockquote>;
  }
  if (node.type === "bullet_list")
    return <ul>{renderTextNodes(node.content)}</ul>;
  if (node.type === "ordered_list") {
    return <ol start={node.attrs?.order}>{renderTextNodes(node.content)}</ol>;
  }
  if (node.type === "list_item")
    return <li>{renderTextNodes(node.content)}</li>;
  if (node.type === "code_block") {
    return (
      <pre>
        <code>{node.content?.map(({ text }) => text).join("")}</code>
      </pre>
    );
  }
  if (node.type === "horizontal_rule") return <hr />;
  if (
    node.type === "text" ||
    node.type === "hard_break" ||
    node.type === "image"
  ) {
    const content = (() => {
      if (node.type === "text") return node.text;
      if (node.type === "hard_break") return <br />;
      return (
        <span className="text-muted-foreground">
          {node.attrs.alt || "Image"}
        </span>
      );
    })();

    return (
      node.marks?.reduceRight<ReactNode>((child, mark) => {
        if (mark.type === "link") {
          const href = mark.attrs.href.trim();
          if (
            /^\/project\/[a-zA-Z0-9_-]+\/notebooks\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?(?:\?version=\d+)?$/.test(
              href,
            )
          ) {
            return <Link href={href}>{child}</Link>;
          }
          const isExternal = /^https?:\/\//i.test(href);
          if (!isExternal && !/^mailto:/i.test(href)) return child;
          return (
            <a href={href} rel="noreferrer" target="_blank">
              {child}
              {isExternal && (
                <span
                  className="ml-0.5 inline-flex align-middle"
                  aria-hidden="true"
                >
                  <ArrowUpRight size="sm" color="muted" />
                </span>
              )}
            </a>
          );
        }
        const type = mark.type;
        if (type === "bold" || type === "strong")
          return <strong>{child}</strong>;
        if (type === "em") return <em>{child}</em>;
        if (type === "code") {
          return (
            <code className="bg-muted rounded px-1 py-0.5 font-normal before:content-none after:content-none">
              {child}
            </code>
          );
        }
        return assertUnreachable(type);
      }, content) ?? content
    );
  }
  return assertUnreachable(node);
}

export function NotebookBlocks({
  blocks,
  renderChart,
  renderTable,
}: {
  blocks: NotebookBlock[];
  renderChart: (
    block: ChartBlock,
    values?: {
      filter?: NotebookVariableValue;
      timeRange?: NotebookVariableValue;
    },
    filters?: readonly string[],
  ) => ReactNode;
  renderTable?: (
    block: Extract<NotebookBlock, { schema: "table@1" }>,
  ) => ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      {blocks.map((block) => {
        if (block.schema === "text@1") {
          return (
            <div
              key={block.id}
              className="prose prose-sm dark:prose-invert prose-headings:tracking-tight prose-h1:text-2xl prose-h1:leading-tight prose-h2:mt-8 prose-h2:mb-2 prose-h2:text-xl prose-h2:leading-tight prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-base prose-h3:leading-snug prose-h4:mt-5 prose-h4:mb-1 prose-strong:font-medium prose-ul:my-2 prose-ol:my-2 prose-li:my-1 max-w-none min-w-0 wrap-break-word [&_li>p]:my-1"
            >
              {renderTextNodes(block.content)}
            </div>
          );
        }
        if (block.schema === "chart@1") {
          return <Fragment key={block.id}>{renderChart(block)}</Fragment>;
        }
        if (block.schema === "table@1") {
          return <Fragment key={block.id}>{renderTable?.(block)}</Fragment>;
        }
        if (block.schema === "row@1") {
          return (
            <div key={block.id} className="flex flex-wrap gap-4">
              {block.props.children.map((child) => (
                <div
                  key={child.id}
                  className="flex min-w-[min(100%,20rem)] flex-1 basis-0 flex-col"
                >
                  <NotebookBlocks
                    blocks={[child]}
                    renderChart={renderChart}
                    renderTable={renderTable}
                  />
                </div>
              ))}
            </div>
          );
        }
        return assertUnreachable(block);
      })}
    </div>
  );
}
import { ArrowUpRight } from "@langfuse/icons";
