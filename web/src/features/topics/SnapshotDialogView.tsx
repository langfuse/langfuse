import { useId, type ReactNode } from "react";
import { Camera, Clock, Layers, Sparkles } from "@langfuse/icons";
import { type TopicFacet } from "@langfuse/shared/topics";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { cn } from "@/src/utils/tailwind";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "./backfill-limit";
import { TopicInlineSelect } from "./TopicInlineSelect";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

type SnapshotSelection = "random" | "latest";
export type SnapshotSummarize = {
  /** Null until toggled, so summarizing turns on by itself when summaries are short. */
  enabled: boolean | null;
  count: number;
  selection: SnapshotSelection;
};

export const SNAPSHOT_DEFAULT_SUMMARIZE: SnapshotSummarize = {
  enabled: null,
  count: 500,
  selection: "random",
};

type SnapshotPreview = {
  summarizedCount: number;
  /** Finished matching traces without a summary for every selected facet; null when the count failed. */
  unsummarizedCount: number | null;
  /** Recommended count; below it the snapshot clusters in small-sample mode. */
  minimumTraceCount: number;
  /** Fewest traces a small-sample snapshot can group. */
  smallSampleMinimumTraceCount: number;
};

const COUNT_PRESETS = [100, 250, 500, 1_000];
const count = (value: number) => value.toLocaleString("en-US");
const traces = (value: number) =>
  `${count(value)} ${value === 1 ? "trace" : "traces"}`;
// Without a count, every preset is offered; the selection takes what exists.
const summarizeMax = (preview: SnapshotPreview) =>
  Math.min(
    TOPICS_BACKFILL_TRACE_LIMIT,
    preview.unsummarizedCount ?? TOPICS_BACKFILL_TRACE_LIMIT,
  );

/** Count choices up to what can be summarized; "all N" when fewer remain. */
function countOptions(max: number) {
  const options = COUNT_PRESETS.filter((preset) => preset <= max);
  if (max > 0 && max < TOPICS_BACKFILL_TRACE_LIMIT && !options.includes(max))
    options.push(max);
  return options;
}

/** The largest option up to the configured count, else the smallest. */
function chosenCount(configured: number, options: number[]) {
  return (
    options.filter((option) => option <= configured).at(-1) ?? options[0] ?? 0
  );
}

/** Whether summarizing is on: the user's choice, else on when summaries are short. */
function summarizeOn(
  summarize: SnapshotSummarize,
  preview: SnapshotPreview | null,
) {
  if (!preview || preview.unsummarizedCount === 0) return false;
  return (
    summarize.enabled ?? preview.summarizedCount < preview.minimumTraceCount
  );
}

/** Traces the snapshot summarizes before grouping; 0 when summarizing is off. */
export function snapshotSummarizeCount(
  summarize: SnapshotSummarize,
  preview: SnapshotPreview | null,
) {
  if (!preview || !summarizeOn(summarize, preview)) return 0;
  return chosenCount(summarize.count, countOptions(summarizeMax(preview)));
}

/** The New snapshot dialog without data fetching; stories render it directly. */
export function SnapshotDialogView({
  name,
  onNameChange,
  filterField,
  facets,
  facetIds,
  onFacetIdsChange,
  preview,
  summarize,
  onSummarizeChange,
  canStart,
  starting,
  errors,
  onStart,
}: SnapshotDialogViewProps) {
  const extra = snapshotSummarizeCount(summarize, preview);
  return (
    <Dialog
      title="New snapshot"
      size="md"
      actions={[
        {
          label: "Create snapshot",
          disabled: !canStart,
          loading: starting,
          onClick: onStart,
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          <TopicSliceFields.Section label="Name">
            <Input
              aria-label="Snapshot name"
              placeholder="e.g. Billing questions"
              value={name}
              maxLength={100}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={onFacetIdsChange}
          />
          {filterField}
          <div className="-mt-3 flex flex-col gap-4">
            <CoverageBar preview={preview} extra={extra} />
            <SummarizeSentence
              preview={preview}
              on={summarizeOn(summarize, preview)}
              value={extra}
              summarize={summarize}
              onChange={onSummarizeChange}
            />
            <SnapshotSummary
              preview={preview}
              extra={extra}
              facetCount={facetIds.length}
            />
          </div>
          {errors.map((message) => (
            <TopicsErrorMessage key={message} message={message} />
          ))}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

/** A stacked bar: already summarized, to summarize, not considered. */
function CoverageBar({
  preview,
  extra,
}: {
  preview: SnapshotPreview | null;
  extra: number;
}) {
  if (!preview)
    return <p className="text-muted-foreground text-sm">Counting summaries…</p>;
  if (preview.unsummarizedCount === null)
    return (
      <p className="text-muted-foreground text-sm">
        {count(preview.summarizedCount)} already summarized · couldn’t count the
        traces without a summary
      </p>
    );
  const total = preview.summarizedCount + preview.unsummarizedCount;
  const share = (value: number) => (total === 0 ? 0 : (value / total) * 100);
  const notConsidered = preview.unsummarizedCount - extra;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="bg-muted flex h-2 overflow-hidden rounded-sm"
        role="img"
        aria-label={`${count(preview.summarizedCount)} already summarized, ${count(extra)} to summarize, ${count(notConsidered)} not considered`}
      >
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${share(preview.summarizedCount)}%` }}
        />
        <div
          className="h-full bg-amber-400 transition-[width] duration-300"
          style={{ width: `${share(extra)}%` }}
        />
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Legend swatch="bg-emerald-500">
          {count(preview.summarizedCount)} already summarized
        </Legend>
        {extra > 0 ? (
          <Legend swatch="bg-amber-400">+{count(extra)} to summarize</Legend>
        ) : null}
        <Legend swatch="bg-muted border">
          {count(notConsidered)} not considered
        </Legend>
      </div>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-xs", swatch)} />
      {children}
    </span>
  );
}

const selectionOptions: { value: SnapshotSelection; label: string }[] = [
  { value: "random", label: "at random" },
  { value: "latest", label: "latest first" },
];

/** "[✓] Summarize [500 ▾] more traces, picked [at random ▾]" */
function SummarizeSentence({
  preview,
  on,
  value,
  summarize,
  onChange,
}: {
  preview: SnapshotPreview | null;
  on: boolean;
  /** The count in effect, from the options that fit. */
  value: number;
  summarize: SnapshotSummarize;
  onChange: (next: SnapshotSummarize) => void;
}) {
  const id = useId();
  const max = preview ? summarizeMax(preview) : 0;
  const options = countOptions(max);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 text-sm",
        max === 0 && "text-muted-foreground",
      )}
    >
      <Checkbox
        id={id}
        checked={on}
        disabled={max === 0}
        onCheckedChange={(next) =>
          onChange({ ...summarize, enabled: next === true })
        }
        aria-label="Summarize more traces"
      />
      <label htmlFor={id} className="ml-1.5">
        Summarize
      </label>
      {max === 0 ? (
        <span>more traces (every matching trace has a summary)</span>
      ) : (
        <>
          <TopicInlineSelect
            label="Traces to summarize"
            value={String(value || chosenCount(summarize.count, options))}
            options={options.map((option) => ({
              value: String(option),
              label:
                option === max && !COUNT_PRESETS.includes(option)
                  ? `all ${count(option)}`
                  : count(option),
            }))}
            onChange={(next) =>
              onChange({ ...summarize, enabled: true, count: Number(next) })
            }
          />
          <span>more traces, picked</span>
          <TopicInlineSelect
            label="Which traces to summarize"
            value={summarize.selection}
            options={selectionOptions}
            onChange={(selection) =>
              onChange({ ...summarize, enabled: true, selection })
            }
          />
        </>
      )}
    </div>
  );
}

/** What the snapshot will group, or why it can't start yet. */
function SnapshotSummary({
  preview,
  extra,
  facetCount,
}: {
  preview: SnapshotPreview | null;
  extra: number;
  facetCount: number;
}) {
  if (!preview)
    return (
      <div className="bg-light-blue text-dark-blue flex items-center gap-2 rounded-md px-4 py-2.5 text-sm">
        <Layers size="base" aria-hidden="true" />
        Counting summarized traces…
      </div>
    );
  const grouped = preview.summarizedCount + extra;
  if (grouped < preview.smallSampleMinimumTraceCount)
    return (
      <div className="bg-light-yellow text-dark-yellow rounded-md px-4 py-2.5 text-sm">
        {preview.summarizedCount === 0
          ? "No summarized traces yet."
          : `Only ${traces(preview.summarizedCount)} summarized.`}{" "}
        A snapshot needs at least {count(preview.smallSampleMinimumTraceCount)}.{" "}
        {preview.unsummarizedCount !== 0
          ? "Summarize more traces or widen the filter."
          : "Widen the filter or time range."}
      </div>
    );
  return (
    <div className="bg-light-blue text-dark-blue flex flex-col gap-1.5 rounded-md px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <Layers size="base" aria-hidden="true" />
        {extra > 0
          ? `~${count(grouped)} traces will be grouped (${count(preview.summarizedCount)} summarized + up to ${count(extra)} new)`
          : `${count(grouped)} summarized traces will be grouped`}
      </span>
      {extra > 0 ? (
        <span className="flex items-center gap-2">
          <Sparkles size="base" aria-hidden="true" />
          Summarizes up to {traces(extra)} first, for {facetCount} selected{" "}
          {facetCount === 1 ? "facet" : "facets"}
        </span>
      ) : null}
      <span className="flex items-center gap-2">
        <Clock size="base" aria-hidden="true" />
        {extra > 0
          ? "Usually ready in 5–10 minutes."
          : "Usually ready in 1–2 minutes."}
      </span>
      <span className="flex items-center gap-2">
        <Camera size="base" aria-hidden="true" />
        Runs once. A snapshot doesn’t change afterwards.
      </span>
    </div>
  );
}

type SnapshotDialogViewProps = {
  name: string;
  onNameChange: (name: string) => void;
  /** The tracing filter with its match line and time range. */
  filterField: ReactNode;
  facets: TopicFacet[];
  facetIds: string[];
  onFacetIdsChange: (facetIds: string[]) => void;
  /** Counts for the current filter and window; null while they load. */
  preview: SnapshotPreview | null;
  summarize: SnapshotSummarize;
  onSummarizeChange: (summarize: SnapshotSummarize) => void;
  canStart: boolean;
  starting: boolean;
  errors: string[];
  onStart: () => void;
};
