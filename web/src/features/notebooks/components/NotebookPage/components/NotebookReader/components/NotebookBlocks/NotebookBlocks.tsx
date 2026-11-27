import { Fragment, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ObservationTypeDomain } from "@langfuse/shared";
import { ItemTypeIcon } from "@/src/components/ItemBadge";
import { api } from "@/src/utils/api";
import {
  ArrowUpRight,
  Clock,
  LayoutDashboard,
  LayoutGrid,
  ListTree,
  NotebookText,
  type IconComponent,
} from "@langfuse/icons";

import {
  type NotebookBlock,
  type NotebookTextNode,
  type NotebookVariableValue,
} from "@/src/features/notebooks/schema";
import { assertUnreachable } from "@/src/utils/types";
import {
  getNotebookBlockMinimumWidth,
  isInteractiveBlock,
} from "@/src/features/notebooks/presentation";

type ChartBlock = Extract<NotebookBlock, { schema: "chart@1" }>;

const headings = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const evidenceIcons: Partial<Record<NotebookBlock["schema"], IconComponent>> = {
  "chart@1": LayoutDashboard,
  "table@1": LayoutGrid,
  "embed@1": ListTree,
};
function InlineLinkBadge({
  icon,
  children,
  ...linkProps
}: Pick<
  ComponentProps<typeof Link>,
  "href" | "title" | "onClick" | "target" | "rel"
> & {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      {...linkProps}
      className="border-border/70 bg-muted/60 text-foreground hover:bg-muted inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 align-[-0.08em] text-[0.85em] leading-tight font-medium no-underline transition-colors hover:no-underline"
    >
      <span className="inline-flex shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

function TraceLinkBadge({
  href,
  projectId,
  traceId,
}: {
  href: string;
  projectId: string;
  traceId: string;
}) {
  const router = useRouter();
  const params = new URL(href, "https://localhost").searchParams;
  const observationId = params.get("observation") || undefined;
  const timestamp = params.get("timestamp") || undefined;
  const traceTimestamp =
    timestamp && Number.isFinite(Date.parse(timestamp))
      ? new Date(timestamp)
      : undefined;
  const options = {
    staleTime: 5 * 60 * 1000,
    retry: false as const,
    meta: { silentHttpCodes: [403, 404] },
  };
  const trace = api.traces.byId.useQuery(
    { projectId, traceId, timestamp: traceTimestamp, verbosity: "compact" },
    { ...options, enabled: !observationId },
  );
  const observation = api.observations.byId.useQuery(
    {
      projectId,
      traceId,
      observationId: observationId ?? "",
      verbosity: "compact",
    },
    { ...options, enabled: !!observationId },
  );
  const type = ObservationTypeDomain.safeParse(observation.data?.type);
  const label = observationId
    ? observation.data?.name || observationId
    : trace.data?.name || traceId;
  return (
    <InlineLinkBadge
      href={href}
      title={label}
      icon={
        <ItemTypeIcon size="sm" type={type.success ? type.data : "TRACE"} />
      }
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          router.query.projectId !== projectId
        )
          return;
        event.preventDefault();
        void router.push(
          {
            pathname: router.pathname,
            query: {
              ...router.query,
              peek: traceId,
              observation: observationId,
              timestamp,
            },
          },
          undefined,
          { shallow: true, scroll: false },
        );
      }}
    >
      {label}
    </InlineLinkBadge>
  );
}

function indexEvidence(
  blocks: NotebookBlock[],
  icons = new Map<string, IconComponent>(),
) {
  for (const block of blocks) {
    icons.set(block.id, evidenceIcons[block.schema] ?? NotebookText);
    if (block.schema === "row@1") indexEvidence(block.props.children, icons);
  }
  return icons;
}

function renderTextNodes(
  nodes: NotebookTextNode[] | undefined,
  icons: ReadonlyMap<string, IconComponent>,
) {
  // Text nodes have no IDs and the reader never reorders them in place.
  return nodes?.map((node, index) => (
    <Fragment key={index}>{renderTextNode(node, icons)}</Fragment>
  ));
}

function renderTextNode(
  node: NotebookTextNode,
  icons: ReadonlyMap<string, IconComponent>,
): ReactNode {
  if (node.type === "paragraph")
    return <p>{renderTextNodes(node.content, icons)}</p>;
  if (node.type === "heading") {
    const Heading = headings[node.attrs.level - 1] ?? "h2";
    return <Heading>{renderTextNodes(node.content, icons)}</Heading>;
  }
  if (node.type === "blockquote") {
    return <blockquote>{renderTextNodes(node.content, icons)}</blockquote>;
  }
  if (node.type === "bullet_list")
    return <ul>{renderTextNodes(node.content, icons)}</ul>;
  if (node.type === "ordered_list") {
    return (
      <ol start={node.attrs?.order}>{renderTextNodes(node.content, icons)}</ol>
    );
  }
  if (node.type === "list_item")
    return <li>{renderTextNodes(node.content, icons)}</li>;
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
          if (/^#block-[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(href)) {
            const Icon = icons.get(href.slice("#block-".length));
            if (!Icon) return <a href={href}>{child}</a>;
            return (
              <InlineLinkBadge href={href} icon={<Icon size="sm" />}>
                {child}
              </InlineLinkBadge>
            );
          }
          const evidence =
            /^\/project\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9_.%~/-]+)(?:[?#][^\s]*)?$/.exec(
              href,
            );
          if (evidence) {
            const id = "(?:[a-zA-Z0-9_.~-]|%[a-fA-F0-9]{2})+";
            const path = evidence[1];
            const query = new URL(href, "https://localhost").searchParams;
            let label: string | undefined;
            if (path === "prompts/prompt-detail") {
              const name = query.get("promptName");
              const version = query.get("version");
              if (name) {
                label = `Prompt · ${name}`;
                if (version && /^\d+$/.test(version)) label += ` · v${version}`;
              }
            } else if (new RegExp(`^datasets/${id}/runs/${id}$`).test(path)) {
              label = "Experiment run";
            } else if (new RegExp(`^datasets/${id}$`).test(path)) {
              label = "Dataset";
            } else if (new RegExp(`^annotation-queues/${id}$`).test(path)) {
              label = "Annotation queue";
            } else if (
              path !== "dashboards/new" &&
              new RegExp(`^dashboards/${id}$`).test(path)
            ) {
              label = "Dashboard";
            }
            if (label) {
              return (
                <InlineLinkBadge
                  href={href}
                  icon={<NotebookText size="sm" />}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label}
                </InlineLinkBadge>
              );
            }
          }
          const resource =
            /^\/project\/([a-zA-Z0-9_-]+)\/(?:(traces|sessions|users)\/((?:[a-zA-Z0-9_.~-]|%[a-fA-F0-9]{2})+)|(scores))(?:[?#][^\s]*)?$/.exec(
              href,
            );
          if (resource) {
            const [, projectId, kind, encodedId] = resource;
            // URLSearchParams decodes the observation ID; decode the path ID too.
            let id: string | undefined;
            try {
              id = encodedId ? decodeURIComponent(encodedId) : undefined;
            } catch {
              /* Keep malformed links navigable. */
            }
            if (kind === "traces" && id) {
              return (
                <TraceLinkBadge
                  href={href}
                  projectId={projectId}
                  traceId={id}
                />
              );
            }
            const Icon = kind === "sessions" ? Clock : LayoutGrid;
            return (
              <InlineLinkBadge
                href={href}
                icon={<Icon size="sm" />}
                target="_blank"
                rel="noopener noreferrer"
              >
                {kind === "sessions"
                  ? id || "Session"
                  : kind === "users"
                    ? "User"
                    : kind === "traces"
                      ? "Trace"
                      : "Scores"}
              </InlineLinkBadge>
            );
          }
          if (
            /^\/project\/[a-zA-Z0-9_-]+\/notebooks\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?(?:\?version=\d+)?$/.test(
              href,
            )
          ) {
            return (
              <InlineLinkBadge
                href={href}
                icon={<NotebookText size="sm" />}
                target="_blank"
                rel="noopener noreferrer"
              >
                {child}
              </InlineLinkBadge>
            );
          }
          const isExternal = /^https?:\/\//i.test(href);
          const isInternal = /^\/(?![\/\\])[^\\\s]*$/.test(href);
          if (!isExternal && !isInternal && !/^mailto:/i.test(href))
            return child;
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
  allowWideRows = false,
  linkedBlockIcons = indexEvidence(blocks),
  renderChart,
  renderButton,
  renderEmbed,
  renderTable,
}: {
  blocks: NotebookBlock[];
  allowWideRows?: boolean;
  linkedBlockIcons?: ReadonlyMap<string, IconComponent>;
  renderChart: (
    block: ChartBlock,
    values?: {
      filter?: NotebookVariableValue;
      timeRange?: NotebookVariableValue;
    },
    filters?: readonly string[],
  ) => ReactNode;
  renderButton?: (
    block: Extract<NotebookBlock, { schema: "button@1" }>,
  ) => ReactNode;
  renderTable?: (
    block: Extract<NotebookBlock, { schema: "table@1" }>,
  ) => ReactNode;
  renderEmbed?: (
    block: Extract<NotebookBlock, { schema: "embed@1" }>,
  ) => ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      {blocks.map((block) => {
        const anchor = {
          id: `block-${block.id}`,
          className: "flex min-w-0 scroll-mt-20 flex-col",
        };
        if (block.schema === "text@1") {
          return (
            <div
              key={block.id}
              id={anchor.id}
              className="prose prose-sm dark:prose-invert prose-headings:tracking-tight prose-h1:text-2xl prose-h1:leading-tight prose-h2:mt-8 prose-h2:mb-2 prose-h2:text-xl prose-h2:leading-tight prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-base prose-h3:leading-snug prose-h4:mt-5 prose-h4:mb-1 prose-strong:font-medium prose-ul:my-2 prose-ol:my-2 prose-li:my-1 max-w-none min-w-0 scroll-mt-20 wrap-break-word [&_li>p]:my-1"
            >
              {renderTextNodes(block.content, linkedBlockIcons)}
            </div>
          );
        }
        if (block.schema === "chart@1") {
          return (
            <div key={block.id} {...anchor}>
              {renderChart(block)}
            </div>
          );
        }
        if (block.schema === "table@1") {
          return (
            <div key={block.id} {...anchor}>
              {renderTable?.(block)}
            </div>
          );
        }
        if (block.schema === "embed@1") {
          return (
            <div key={block.id} {...anchor}>
              {renderEmbed?.(block)}
            </div>
          );
        }
        if (block.schema === "button@1") {
          return (
            <div key={block.id} {...anchor}>
              {renderButton?.(block)}
            </div>
          );
        }
        if (block.schema === "row@1") {
          const { children } = block.props;
          const hasTable = children.some((child) => child.schema === "table@1");
          const compactTracePair =
            children.length === 2 &&
            hasTable &&
            children.some(
              (child) =>
                child.schema === "embed@1" &&
                child.props.target.kind === "trace",
            );
          const breakout =
            allowWideRows &&
            children.length > 1 &&
            children.every(isInteractiveBlock);
          return (
            <div
              key={block.id}
              id={anchor.id}
              className={`flex min-w-0 scroll-mt-20 flex-wrap items-stretch gap-4 ${
                breakout
                  ? "w-[max(100%,min(calc(100%+16rem),calc(100cqw-3rem)))] self-center"
                  : ""
              }`}
            >
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex min-w-0 flex-col [&>div>div]:grow"
                  style={{
                    flexBasis: `min(100%, ${
                      compactTracePair
                        ? child.schema === "table@1"
                          ? Math.min(280, getNotebookBlockMinimumWidth(child))
                          : 600
                        : getNotebookBlockMinimumWidth(child)
                    }px)`,
                    flexGrow: hasTable && child.schema === "embed@1" ? 8 : 1,
                  }}
                >
                  <NotebookBlocks
                    blocks={[child]}
                    linkedBlockIcons={linkedBlockIcons}
                    renderChart={renderChart}
                    renderButton={renderButton}
                    renderEmbed={renderEmbed}
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
