"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { defineRegistry } from "@json-render/react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Progress } from "@/src/components/design-system/Progress/Progress";
import { reportError } from "@/src/utils/reportError";
import { customUiCatalog } from "./catalogDefinition";

type CatalogTone = "neutral" | "info" | "success" | "warning" | "danger";

const badgeColorByTone = {
  neutral: "filled",
  info: "blue",
  success: "green",
  warning: "yellow",
  danger: "red",
} as const;

const borderByTone = {
  neutral: "border-border",
  info: "border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20",
  success:
    "border-green-200 bg-green-50/40 dark:border-green-900 dark:bg-green-950/20",
  warning:
    "border-yellow-200 bg-yellow-50/40 dark:border-yellow-900 dark:bg-yellow-950/20",
  danger: "border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20",
} as const;

const textValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const boundedJsonValue = (
  value: unknown,
  budget: { remaining: number },
  depth = 0,
  seen = new WeakSet<object>(),
): unknown => {
  if (typeof value === "string") {
    return value.length > 4_000 ? `${value.slice(0, 3_999)}…` : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (budget.remaining <= 0 || depth >= 8) return "[More data hidden]";
  if (seen.has(value)) return "[Circular value]";
  seen.add(value);

  if (Array.isArray(value)) {
    const output = [];
    for (const item of value) {
      if (output.length >= 100 || budget.remaining <= 0) break;
      budget.remaining -= 1;
      output.push(boundedJsonValue(item, budget, depth + 1, seen));
    }
    if (value.length > output.length) output.push("[More items hidden]");
    return output;
  }

  const output: Record<string, unknown> = {};
  let count = 0;
  for (const key in value as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (count >= 100 || budget.remaining <= 0) {
      output["…"] = "More fields hidden";
      break;
    }
    budget.remaining -= 1;
    output[key] = boundedJsonValue(
      (value as Record<string, unknown>)[key],
      budget,
      depth + 1,
      seen,
    );
    count += 1;
  }
  return output;
};

const safeJson = (value: unknown): string => {
  try {
    return (
      JSON.stringify(boundedJsonValue(value, { remaining: 500 }), null, 2) ??
      "null"
    );
  } catch {
    return "Unable to display this value.";
  }
};

const boundedLines = (value: unknown, maximum: unknown) => {
  const source = textValue(value);
  const limit = Math.min(
    100,
    Math.max(1, typeof maximum === "number" ? maximum : 20),
  );
  const lines = source.split(/\r?\n/u);
  return {
    content: lines.slice(0, limit).join("\n"),
    omitted: Math.max(0, lines.length - limit),
  };
};

const textClassName = (variant: string) => {
  if (variant === "mono") {
    return "font-mono text-xs whitespace-pre-wrap break-words";
  }
  if (variant === "muted") {
    return "text-muted-foreground text-sm whitespace-pre-wrap break-words";
  }
  return "text-sm whitespace-pre-wrap break-words";
};

const heading = (level: number, text: string) => {
  if (level === 2) {
    return <h2 className="text-lg font-bold text-balance">{text}</h2>;
  }
  if (level === 3) {
    return <h3 className="text-base font-bold text-balance">{text}</h3>;
  }
  return <h4 className="text-sm font-bold text-balance">{text}</h4>;
};

class CatalogNodeErrorBoundary extends Component<
  { children: ReactNode; componentKind: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    reportError(new Error("Custom UI catalog component failed"), {
      area: "custom-ui-renderer",
      tags: {
        stage: "render",
        component_kind: this.props.componentKind,
      },
      warnMessage: "A catalog component failed to render",
    });
  }

  render() {
    return this.state.failed ? (
      <p className="text-muted-foreground text-xs" role="status">
        This section could not be displayed.
      </p>
    ) : (
      this.props.children
    );
  }
}

function NodeBoundary({
  componentKind,
  children,
}: {
  componentKind: string;
  children: ReactNode;
}) {
  return (
    <CatalogNodeErrorBoundary componentKind={componentKind}>
      {children}
    </CatalogNodeErrorBoundary>
  );
}

export const { registry: customUiRegistry } = defineRegistry(customUiCatalog, {
  components: {
    Card: ({ props, children }) => (
      <NodeBoundary componentKind="Card">
        <section
          className={`flex min-w-0 flex-col gap-3 rounded-lg border p-4 ${borderByTone[props.tone as CatalogTone] ?? borderByTone.neutral}`}
        >
          {(props.title || props.description) && (
            <header className="flex min-w-0 flex-col gap-1">
              {props.title && (
                <h3 className="text-sm font-bold">{props.title}</h3>
              )}
              {props.description && (
                <p className="text-muted-foreground text-sm">
                  {props.description}
                </p>
              )}
            </header>
          )}
          {children}
        </section>
      </NodeBoundary>
    ),
    Stack: ({ props, children }) => {
      const gap = {
        xs: "gap-1",
        sm: "gap-2",
        md: "gap-4",
        lg: "gap-6",
      }[props.gap];
      return (
        <NodeBoundary componentKind="Stack">
          <div className={`flex min-w-0 flex-col ${gap}`}>{children}</div>
        </NodeBoundary>
      );
    },
    Grid: ({ props, children }) => (
      <NodeBoundary componentKind="Grid">
        <div
          className={
            props.columns === 3
              ? "grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3"
              : "grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
          }
        >
          {children}
        </div>
      </NodeBoundary>
    ),
    Heading: ({ props }) => (
      <NodeBoundary componentKind="Heading">
        {heading(props.level, props.text)}
      </NodeBoundary>
    ),
    Text: ({ props }) => {
      const content = textValue(props.content);
      const maxLines =
        typeof props.maxLines === "number"
          ? Math.min(20, Math.max(1, props.maxLines))
          : undefined;
      const display = maxLines
        ? content.split(/\r?\n/u).slice(0, maxLines).join("\n")
        : content;
      const className = textClassName(props.variant);
      return (
        <NodeBoundary componentKind="Text">
          <p
            className={className}
            title={display === content ? undefined : content}
          >
            {display}
            {display !== content && "…"}
          </p>
        </NodeBoundary>
      );
    },
    Badge: ({ props }) => (
      <NodeBoundary componentKind="Badge">
        <Badge
          color={badgeColorByTone[props.tone as CatalogTone] ?? "filled"}
          text={textValue(props.text)}
        />
      </NodeBoundary>
    ),
    Alert: ({ props }) => (
      <NodeBoundary componentKind="Alert">
        <section
          className={`flex min-w-0 flex-col gap-1 rounded-md border p-3 ${borderByTone[props.tone]}`}
          role={props.tone === "danger" ? "alert" : "status"}
        >
          <h4 className="text-sm font-bold">{props.title}</h4>
          <p className="text-sm whitespace-pre-wrap">{props.message}</p>
        </section>
      </NodeBoundary>
    ),
    Stat: ({ props }) => (
      <NodeBoundary componentKind="Stat">
        <article
          className={`flex min-w-0 flex-col gap-1 rounded-md border p-3 ${borderByTone[props.tone as CatalogTone] ?? borderByTone.neutral}`}
        >
          <span className="text-muted-foreground text-xs">{props.label}</span>
          <strong className="text-xl break-words">
            {textValue(props.value)}
          </strong>
          {props.detail && (
            <span className="text-muted-foreground text-xs">
              {props.detail}
            </span>
          )}
        </article>
      </NodeBoundary>
    ),
    Meter: ({ props }) => {
      const range = props.max - props.min;
      const percentage =
        range > 0
          ? Math.min(
              100,
              Math.max(0, ((props.value - props.min) / range) * 100),
            )
          : 0;
      return (
        <NodeBoundary componentKind="Meter">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{props.label}</span>
              <span className="font-mono text-xs">
                {textValue(props.value)}
              </span>
            </div>
            <Progress value={percentage} />
            {props.detail && (
              <span className="text-muted-foreground text-xs">
                {props.detail}
              </span>
            )}
          </div>
        </NodeBoundary>
      );
    },
    KeyValue: ({ props }) => {
      const value = textValue(props.value);
      const maximum = Math.min(500, Math.max(20, props.maxCharacters));
      const clipped =
        value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
      return (
        <NodeBoundary componentKind="KeyValue">
          <dl className="grid min-w-0 grid-cols-[minmax(5rem,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{props.label}</dt>
            <dd
              className="min-w-0 break-words"
              title={clipped === value ? undefined : value}
            >
              {clipped}
            </dd>
          </dl>
        </NodeBoundary>
      );
    },
    ListItem: ({ props }) => (
      <NodeBoundary componentKind="ListItem">
        <article className="flex min-w-0 items-start justify-between gap-3 border-b py-2 last:border-b-0">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-bold break-words">{props.primary}</p>
            {props.secondary && (
              <p className="text-muted-foreground text-xs break-words whitespace-pre-wrap">
                {props.secondary}
              </p>
            )}
          </div>
          {props.badge && <Badge color="filled" text={props.badge} />}
        </article>
      </NodeBoundary>
    ),
    MessageList: ({ props }) => {
      const maximum = Math.min(50, Math.max(1, props.maxVisible));
      const messages = Array.isArray(props.messages)
        ? props.messages.slice(0, maximum)
        : [];
      return (
        <NodeBoundary componentKind="MessageList">
          <div className="flex min-w-0 flex-col gap-3">
            {messages.map((message, index) => (
              <article
                className="bg-muted/40 flex min-w-0 flex-col gap-1 rounded-md px-3 py-2"
                key={index}
              >
                <span className="text-muted-foreground text-xs">
                  {message.label || message.role}
                </span>
                <p className="text-sm break-words whitespace-pre-wrap">
                  {message.content}
                </p>
              </article>
            ))}
            {props.messages.length > messages.length && (
              <p className="text-muted-foreground text-xs">
                {props.messages.length - messages.length} more messages hidden
              </p>
            )}
          </div>
        </NodeBoundary>
      );
    },
    ToolCallSummary: ({ props }) => (
      <NodeBoundary componentKind="ToolCallSummary">
        <article className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
          <header className="flex items-center justify-between gap-3">
            <h4
              className="truncate font-mono text-sm font-bold"
              title={props.name}
            >
              {props.name}
            </h4>
            {props.status && <Badge color="filled" text={props.status} />}
          </header>
          {props.inputSummary && (
            <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
              {props.inputSummary}
            </p>
          )}
          {props.outputSummary && (
            <p className="text-sm break-words whitespace-pre-wrap">
              {props.outputSummary}
            </p>
          )}
        </article>
      </NodeBoundary>
    ),
    CodePreview: ({ props }) => {
      const code = boundedLines(props.code, props.maxLines);
      return (
        <NodeBoundary componentKind="CodePreview">
          <figure className="flex min-w-0 flex-col gap-2">
            {(props.label || props.language) && (
              <figcaption className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                <span>{props.label}</span>
                <span className="font-mono">{props.language}</span>
              </figcaption>
            )}
            <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 font-mono text-xs break-words whitespace-pre-wrap">
              {code.content}
            </pre>
            {code.omitted > 0 && (
              <span className="text-muted-foreground text-xs">
                {code.omitted} more lines hidden
              </span>
            )}
          </figure>
        </NodeBoundary>
      );
    },
    Json: ({ props }) => {
      const json = safeJson(props.value);
      return (
        <NodeBoundary componentKind="Json">
          <details className="min-w-0" open={!props.collapsed}>
            <summary className="cursor-pointer text-sm font-bold">
              {props.label || "Structured data"}
            </summary>
            <pre className="bg-muted mt-2 max-h-96 overflow-auto rounded-md p-3 font-mono text-xs break-words whitespace-pre-wrap">
              {json}
            </pre>
          </details>
        </NodeBoundary>
      );
    },
    Accordion: ({ props, children }) => (
      <NodeBoundary componentKind="Accordion">
        <details className="min-w-0 border-t pt-2" open={props.defaultOpen}>
          <summary className="cursor-pointer text-sm font-bold">
            {props.title}
          </summary>
          <div className="pt-3">{children}</div>
        </details>
      </NodeBoundary>
    ),
    Timeline: ({ props }) => (
      <NodeBoundary componentKind="Timeline">
        <ol className="flex min-w-0 flex-col">
          {props.items.map((item, index) => (
            <li
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"
              key={index}
            >
              <div className="flex flex-col items-center" aria-hidden>
                <span className="bg-primary mt-1.5 h-2 w-2 rounded-full" />
                {index < props.items.length - 1 && (
                  <span className="bg-border min-h-6 w-px flex-1" />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 pb-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold break-words">
                    {item.label}
                  </span>
                  {item.time && (
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">
                      {item.time}
                    </span>
                  )}
                </div>
                {item.detail && (
                  <span className="text-muted-foreground text-xs break-words">
                    {item.detail}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </NodeBoundary>
    ),
    BarList: ({ props }) => {
      const maximum = Math.max(
        0,
        ...props.items.map((item) => Math.abs(item.value)),
      );
      return (
        <NodeBoundary componentKind="BarList">
          <div className="flex min-w-0 flex-col gap-3">
            {props.items.map((item, index) => (
              <div className="flex min-w-0 flex-col gap-1" key={index}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate" title={item.label}>
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono">
                    {item.value}
                    {props.valueLabel ? ` ${props.valueLabel}` : ""}
                  </span>
                </div>
                <Progress
                  value={
                    maximum === 0 ? 0 : (Math.abs(item.value) / maximum) * 100
                  }
                />
              </div>
            ))}
          </div>
        </NodeBoundary>
      );
    },
  },
});
