import { useState, type ChangeEvent } from "react";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "./backfill-limit";
import { eventsEvalFilterColumns, type FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Textarea } from "@/src/components/ui/textarea";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";

const columns = eventsEvalFilterColumns
  .filter((column) => column.id !== "isRootObservation")
  .map((column) =>
    column.id === "environment" && column.type === "stringOptions"
      ? {
          ...column,
          options: [
            { value: "production" },
            { value: "topics-eval" },
            { value: "development" },
          ],
        }
      : column,
  );
const previewNames = [
  "Customer support conversation",
  "Agent research session",
  "Checkout troubleshooting",
];

// Uses the existing filter builder; selection and preview results are mocked.
export function TopicTraceSelectionPrototype({
  matchedCount,
  onSelect,
}: TopicTraceSelectionPrototypeProps) {
  const [method, setMethod] = useState("filters");
  const [filterMode, setFilterMode] = useState<"builder" | "query">("builder");
  const [filters, setFilters] = useState<FilterState>([]);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("7");
  const [dates, setDates] = useState({ from: "2026-10-07", to: "2026-10-14" });
  const [limit, setLimit] = useState(String(TOPICS_BACKFILL_TRACE_LIMIT));
  const [sampling, setSampling] = useState("random");
  const [paste, setPaste] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<number[]>([]);
  const validLimit =
    Number.isSafeInteger(Number(limit)) &&
    Number(limit) >= 1 &&
    Number(limit) <= TOPICS_BACKFILL_TRACE_LIMIT;
  const validRange =
    range !== "custom" ||
    (dates.from !== "" && dates.to !== "" && dates.from < dates.to);
  const invalidate = () => {
    setPreviewCount(null);
    setExcluded([]);
    onSelect(0);
  };
  const handleMethodChange = (value: string) => {
    setMethod(value);
    invalidate();
  };
  const handleRangeChange = (value: string) => {
    setRange(value);
    invalidate();
  };
  const handleStartDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDates((current) => ({ ...current, from: event.target.value }));
    invalidate();
  };
  const handleEndDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDates((current) => ({ ...current, to: event.target.value }));
    invalidate();
  };
  const handleFilterModeChange = (value: "builder" | "query") => {
    setFilterMode(value);
    invalidate();
  };
  const handleFiltersChange = (value: FilterState) => {
    setFilters(value);
    invalidate();
  };
  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    invalidate();
  };
  const handleLimitChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLimit(event.target.value);
    invalidate();
  };
  const handleSamplingChange = (value: string) => {
    setSampling(value);
    invalidate();
  };
  const handlePreview = () => {
    const count = Math.min(matchedCount, Number(limit));
    setPreviewCount(count);
    setExcluded([]);
    onSelect(count);
  };
  const handleTraceToggle = (index: number, checked: boolean) => {
    const next = checked
      ? excluded.filter((item) => item !== index)
      : [...excluded, index];
    setExcluded(next);
    onSelect((previewCount ?? 0) - next.length);
  };
  const handlePasteChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setPaste(value);
    const count = new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ).size;
    onSelect(count <= TOPICS_BACKFILL_TRACE_LIMIT ? count : 0);
  };
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Select traces</h2>
        <Tabs value={method} onValueChange={handleMethodChange}>
          <Tabs.List
            variant="inset"
            size="md"
            aria-label="Trace selection method"
          >
            <Tabs.Trigger value="filters" label="Filters" />
            <Tabs.Trigger value="paste" label="Paste IDs" />
          </Tabs.List>
        </Tabs>
      </div>
      {method === "filters" ? (
        <>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              Time range
              <SelectInput
                aria-label="Trace time range"
                value={range}
                placeholder="Time range"
                options={[
                  { value: "1", label: "Last 24 hours" },
                  { value: "7", label: "Last 7 days" },
                  { value: "30", label: "Last 30 days" },
                  { value: "90", label: "Last 90 days" },
                  { value: "custom", label: "Custom range" },
                ]}
                onValueChange={handleRangeChange}
              />
            </label>
            <span className="text-muted-foreground pb-1 text-xs">
              Independent of the Topics page time range.
            </span>
          </div>
          {range === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                From
                <Input
                  aria-label="Trace start date"
                  type="date"
                  value={dates.from}
                  onChange={handleStartDateChange}
                />
              </label>
              <label className="flex flex-col gap-1">
                To
                <Input
                  aria-label="Trace end date"
                  type="date"
                  value={dates.to}
                  onChange={handleEndDateChange}
                />
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">Filter observations</span>
            <FilterModeToggle
              mode={filterMode}
              onChange={handleFilterModeChange}
            />
          </div>
          {filterMode === "builder" ? (
            <ObservationFilterBuilder
              columns={columns}
              filterState={filters}
              queryOnlyColumnIds={["metadata"]}
              onChange={handleFiltersChange}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Input
                aria-label="Observation filter query"
                placeholder="env:production level:ERROR"
                value={query}
                onChange={handleQueryChange}
              />
              <p className="text-muted-foreground text-xs">
                Query editor preview. Results are mocked in Storybook.
              </p>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            A trace is selected when an observation matches every filter.
            Summarization uses the whole trace conversation.
          </p>
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                Maximum traces
                <Input
                  aria-label="Sample size"
                  type="number"
                  min={1}
                  max={TOPICS_BACKFILL_TRACE_LIMIT}
                  aria-invalid={!validLimit}
                  value={limit}
                  onChange={handleLimitChange}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                Selection
                <SelectInput
                  aria-label="Trace sampling method"
                  value={sampling}
                  placeholder="Selection"
                  options={[
                    { value: "random", label: "Random sample" },
                    { value: "latest", label: "Newest first" },
                  ]}
                  onValueChange={handleSamplingChange}
                />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              text={
                previewCount === null ? "Preview traces" : "Refresh selection"
              }
              variant="secondary"
              size="sm"
              disabled={!validLimit || !validRange}
              onClick={handlePreview}
            />
            <span className="text-muted-foreground text-xs">
              Previewing does not use a model.
            </span>
          </div>
          {!validLimit || !validRange ? (
            <p role="alert" className="text-destructive text-xs">
              Choose a valid date range and a positive whole number for the
              batch size (up to {TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString()}).
            </p>
          ) : null}
          {previewCount !== null ? (
            <div className="flex flex-col gap-2">
              <p role="status" className="font-bold">
                {matchedCount.toLocaleString()} matching ·{" "}
                {(previewCount - excluded.length).toLocaleString()} selected
              </p>
              {previewNames
                .slice(0, Math.min(3, previewCount))
                .map((name, index) => (
                  <PreviewTrace
                    key={name}
                    name={name}
                    index={index}
                    checked={!excluded.includes(index)}
                    onToggle={handleTraceToggle}
                  />
                ))}
              <p className="text-muted-foreground text-xs">
                Showing up to 3 preview traces. Unchecked traces are excluded.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              First preview and select your traces, then choose Summarize &
              embed to start.
            </p>
          )}
        </>
      ) : (
        <label className="flex flex-col gap-2">
          Trace IDs or links
          <Textarea
            aria-label="Trace IDs or links"
            className="min-h-32 font-mono text-xs"
            placeholder="One trace ID or local trace link per line"
            value={paste}
            onChange={handlePasteChange}
          />
          <span className="text-muted-foreground text-xs">
            Up to {TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString()} unique trace
            IDs from this project. Parsing is mocked in this preview.
          </span>
        </label>
      )}
    </section>
  );
}

function PreviewTrace({ name, index, checked, onToggle }: PreviewTraceProps) {
  const handleCheckedChange = (value: boolean | "indeterminate") => {
    onToggle(index, value === true);
  };
  return (
    <label className="flex items-center gap-2 rounded-md border px-3 py-2">
      <Checkbox checked={checked} onCheckedChange={handleCheckedChange} />
      <span className="flex flex-col gap-0.5">
        <span>{name}</span>
        <span className="text-muted-foreground text-xs">
          topics-eval · Oct 14, 2026
        </span>
      </span>
    </label>
  );
}

type TopicTraceSelectionPrototypeProps = {
  matchedCount: number;
  onSelect: (count: number) => void;
};

type PreviewTraceProps = {
  name: string;
  index: number;
  checked: boolean;
  onToggle: (index: number, checked: boolean) => void;
};
