"use client";

import { Wrench } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { ItemTypeIcon } from "@/src/components/ItemBadge";
import { formatDurationMs } from "@/src/features/traces/fns/timeline/layout";
import { cn } from "@/src/utils/tailwind";
import type { Receipt, WaterfallRow as Row } from "../../firstTrace";
import type { FirstTraceNode } from "../../types";

/** Each step's bar in its type's colour, as the trace view draws it. */
const BAR_COLOR = {
  TRACE: "bg-observation-trace-fill",
  SPAN: "bg-observation-span-fill",
  EVENT: "bg-observation-event-fill",
  GENERATION: "bg-observation-generation-fill",
  AGENT: "bg-observation-agent-fill",
  TOOL: "bg-observation-tool-fill",
  CHAIN: "bg-observation-chain-fill",
  RETRIEVER: "bg-observation-retriever-fill",
  EVALUATOR: "bg-observation-evaluator-fill",
  EMBEDDING: "bg-observation-embedding-fill",
  GUARDRAIL: "bg-observation-guardrail-fill",
} satisfies Record<FirstTraceNode["type"], string>;

/** What each kind of step is, in the docs' words made plain, for the reading guide. */
const TYPE_MEANING = {
  TRACE: {
    label: "Trace",
    meaning: "One run of your app, from request to answer.",
  },
  SPAN: { label: "Span", meaning: "A unit of work and how long it took." },
  EVENT: { label: "Event", meaning: "Something that happened at one moment." },
  GENERATION: {
    label: "Generation",
    meaning: "A call to an LLM: its prompt, model, tokens and cost.",
  },
  AGENT: {
    label: "Agent",
    meaning: "Decides what happens next and uses tools, guided by an LLM.",
  },
  TOOL: { label: "Tool", meaning: "One action, like a function or API call." },
  CHAIN: {
    label: "Chain",
    meaning: "Links steps, like passing what a retriever found to an LLM call.",
  },
  RETRIEVER: {
    label: "Retriever",
    meaning: "Looks something up, like a vector store or database.",
  },
  EVALUATOR: {
    label: "Evaluator",
    meaning:
      "Checks an LLM's output, for example whether it's correct or helpful.",
  },
  EMBEDDING: {
    label: "Embedding",
    meaning: "A call to a model that turns text into embeddings.",
  },
  GUARDRAIL: {
    label: "Guardrail",
    meaning: "Protects against harmful content or jailbreaks.",
  },
} satisfies Record<FirstTraceNode["type"], { label: string; meaning: string }>;

const GOOD_TRACE = "https://langfuse.com/docs/observability/best-practices";
const OBSERVATION_TYPES =
  "https://langfuse.com/docs/observability/features/observation-types";

/** Nesting, one step per level; deeper steps keep the last indent. */
const INDENT = ["", "pl-4", "pl-8", "pl-12"] as const;

type TracePreviewProps = {
  /** The trace as `readingOf` reads it, once per trace. */
  receipt: Receipt;
};

const countOf = (count: number, noun: string) =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** A coding agent's turn: the prompt, how much it did, and the tools it reached for most. */
function AgentTurn({
  input,
  summary: { steps, toolCalls, topTools, warnings },
}: Extract<Receipt, { kind: "turn" }>) {
  return (
    <div className="flex flex-col gap-2.5">
      {input === null ? null : (
        <p className="text-sm">
          <span className="text-muted-foreground">You asked </span>
          <span className="line-clamp-2" title={input}>
            “{input}”
          </span>
        </p>
      )}
      <p className="text-foreground-secondary text-xs">
        {[
          countOf(steps, "step"),
          countOf(toolCalls, "tool call"),
          ...(warnings > 0 ? [countOf(warnings, "warning")] : []),
        ].join(" · ")}
      </p>
      {topTools.length > 0 ? (
        <ul
          aria-label="Tools it called most"
          className="flex flex-wrap gap-1.5"
        >
          {topTools.map(({ name, count }) => (
            <li key={name}>
              <Badge
                text={`${name} ×${count}`}
                color="filled"
                size="lg"
                font="mono"
                leadingIcon={Wrench}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WaterfallRow({ node, depth, start, share, startMs, durationMs }: Row) {
  const isError = node.level === "ERROR";
  const { label, meaning } = TYPE_MEANING[node.type];
  return (
    <li className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-x-3 gap-y-0.5 text-xs">
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          INDENT[Math.min(depth, INDENT.length - 1)],
        )}
      >
        <Tooltip
          label={
            node.model
              ? `${label} · ${node.model}: ${meaning}`
              : `${label}: ${meaning}`
          }
        >
          {({ getTriggerProps }) => (
            <span
              role="img"
              aria-label={label}
              className="flex shrink-0"
              {...getTriggerProps()}
            >
              <ItemTypeIcon type={node.type} />
            </span>
          )}
        </Tooltip>
        <span className="truncate font-mono" title={node.name}>
          {node.name}
        </span>
        {isError ? <Badge text="Error" color="red" size="sm" /> : null}
      </span>
      <Tooltip
        label={`Started ${formatDurationMs(startMs)} in, took ${formatDurationMs(durationMs)}`}
      >
        {({ getTriggerProps }) => (
          <span
            className="bg-muted relative h-1.5 rounded-full"
            {...getTriggerProps()}
          >
            <span
              className={cn(
                "absolute inset-y-0 min-w-1 rounded-full",
                isError ? "bg-dark-red" : BAR_COLOR[node.type],
              )}
              style={{ left: `${start * 100}%`, width: `${share * 100}%` }}
            />
          </span>
        )}
      </Tooltip>
      <span className="text-muted-foreground text-right font-mono">
        {formatDurationMs(durationMs)}
      </span>
      {isError && node.statusMessage ? (
        <span
          className="text-foreground-secondary col-span-3 truncate pl-6"
          title={node.statusMessage}
        >
          {node.statusMessage}
        </span>
      ) : null}
    </li>
  );
}

/** An app trace's first steps on its timeline, and how many more there are. */
function Waterfall({
  rows,
  hiddenCount,
}: Extract<Receipt, { kind: "waterfall" }>) {
  return (
    <ul aria-label="Steps" className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <WaterfallRow key={row.node.id} {...row} />
      ))}
      {hiddenCount > 0 ? (
        <li className="text-muted-foreground pl-6 text-xs">
          +{countOf(hiddenCount, "more step")}
        </li>
      ) : null}
    </ul>
  );
}

function ReceiptBody({ receipt }: TracePreviewProps) {
  switch (receipt.kind) {
    case "turn":
      return <AgentTurn {...receipt} />;
    case "waterfall":
      return <Waterfall {...receipt} />;
  }
}

/** One kind of step in the trace's visual language, named, with what it means on hover or focus. */
function GuideChip({ type }: { type: FirstTraceNode["type"] }) {
  const { label, meaning } = TYPE_MEANING[type];
  return (
    <Tooltip label={meaning} placement="bottom">
      {({ getTriggerProps }) => (
        <button
          type="button"
          aria-label={`${label}: ${meaning}`}
          className="bg-background text-foreground-secondary hover:text-foreground focus-visible:ring-ring inline-flex h-5 items-center gap-1 rounded-full border px-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
          {...getTriggerProps()}
        >
          <ItemTypeIcon type={type} className="size-3 shrink-0" />
          {label}
        </button>
      )}
    </Tooltip>
  );
}

/**
 * A trace's receipt in the trace view's own icons and colours: an app's first steps as a waterfall, or a coding
 * agent's turn as what you asked and the tools it called (some plugins record most steps as instants, so bars would
 * mislead there). Then a guide to reading it, its two most telling kinds of step and links to all of them and to what
 * a good trace looks like. Every icon and bar explains itself on hover; the guide's chips do on focus too.
 */
export function TracePreview({ receipt }: TracePreviewProps) {
  return (
    <div className="ph-no-capture flex flex-col gap-3">
      <ReceiptBody receipt={receipt} />
      <div className="flex flex-wrap items-center gap-1 border-t pt-3 text-xs">
        <span className="text-muted-foreground mr-1">How to read it</span>
        {receipt.types.map((type) => (
          <GuideChip key={type} type={type} />
        ))}
        <Button
          text="All types"
          variant="text"
          size="sm"
          href={OBSERVATION_TYPES}
        />
        <span className="ml-auto">
          <Button
            text="What's a good trace?"
            variant="text"
            size="sm"
            href={GOOD_TRACE}
          />
        </span>
      </div>
    </div>
  );
}
