import { useId, type ReactNode } from "react";
import { Info } from "@langfuse/icons";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/design-system/Input/Input";
import { Slider } from "@/src/components/ui/Slider";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";

/** A labelled block of a Topics slice dialog, e.g. "Traces" or "Facets". */
function TopicDialogSection({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm leading-none font-bold">{label}</h3>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

type TopicFacetOption = {
  id: string;
  name: string;
  description: string;
};

/** The questions a scan answers, one row each with its description. */
function TopicFacetChecklist({
  facets,
  selectedIds,
  onChange,
  disabled,
}: {
  facets: TopicFacetOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">What to look for</h3>
      <div className="divide-y rounded-md border">
        {facets.map((facet) => (
          <div
            key={facet.id}
            className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 px-3 py-2.5 sm:grid-cols-[16px_96px_minmax(0,1fr)]"
          >
            <Checkbox
              checked={selectedIds.includes(facet.id)}
              disabled={disabled}
              aria-label={facet.name}
              onCheckedChange={(next) =>
                onChange(
                  next === true
                    ? [...selectedIds, facet.id]
                    : selectedIds.filter((id) => id !== facet.id),
                )
              }
            />
            <span className="text-sm font-bold">{facet.name}</span>
            <span className="text-muted-foreground col-start-2 text-sm sm:col-start-auto">
              {facet.description}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function dailyEstimate(dailyTraces: number, samplePercent: number) {
  const perDay = (dailyTraces * samplePercent) / 100;
  if (perDay > 0 && perDay < 1) return "<1";
  return Math.round(perDay).toLocaleString("en-US");
}

function samplePercentFromInput(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const percent = Number(value);
  if (percent < 1 || percent > 100) return null;
  return percent;
}

function dailyVolumeLabel(perDay: string) {
  if (perDay === "<1") return "<1 new trace / day";
  return `~${perDay} new ${perDay === "1" ? "trace" : "traces"} / day`;
}

/** One row: the share of matching traces a scan analyzes, with its daily volume. */
function TopicSamplingField({
  value,
  onChange,
  dailyTraces,
  disabled,
  tooltip,
}: {
  value: number;
  onChange: (percent: number) => void;
  /** Matching traces per day; null while unknown. */
  dailyTraces: number | null;
  disabled?: boolean;
  tooltip: string;
}) {
  const perDay =
    dailyTraces === null ? null : dailyEstimate(dailyTraces, value);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <SectionHeader
        title="Sampling rate"
        meta={null}
        description={null}
        tooltip={tooltip}
        trailing={null}
      />
      <div className="flex items-center gap-2">
        <div className="w-32">
          <Slider
            min={1}
            max={100}
            step={1}
            value={[value]}
            aria-label="Sampling rate"
            disabled={disabled}
            onValueChange={(next) => onChange(next[0] ?? value)}
          />
        </div>
        <div className="w-16">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            aria-label="Sampling rate percent"
            value={String(value)}
            disabled={disabled}
            onChange={(event) => {
              const percent = samplePercentFromInput(event.target.value);
              if (percent !== null) onChange(percent);
            }}
          />
        </div>
        <span className="text-muted-foreground text-sm">
          %{perDay === null ? null : ` · ${dailyVolumeLabel(perDay)}`}
        </span>
      </div>
    </div>
  );
}

/** The Auto-analyze switch that makes a scan live; `children` (the sample rate) show while on. */
function TopicAutoAnalyzeField({
  on,
  onChange,
  disabledReason,
  children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  /** Why the scan can't be live, e.g. the project's live scan limit. */
  disabledReason?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <label htmlFor={id} className="text-sm leading-none font-bold">
              Auto-analyze
            </label>
            {on ? <Badge text="LIVE" size="sm" color="success" /> : null}
          </span>
          <p className="text-muted-foreground text-sm">
            {disabledReason ?? "Analyze new matching traces as they arrive."}
          </p>
        </div>
        <Switch
          id={id}
          checked={on}
          disabled={Boolean(disabledReason)}
          onCheckedChange={onChange}
        />
      </div>
      {on ? children : null}
    </section>
  );
}

/** Shown where a scan's traces are chosen: topics are clustered per scan. */
function TopicScanScopeHint() {
  return (
    <Alert variant="info" size="sm" icon={Info}>
      <Alert.Description>
        <p>
          Topics groups whole traces. If this project traces several agents or
          applications, filter to one and add a live scan for each, so each gets
          its own topics.
        </p>
      </Alert.Description>
    </Alert>
  );
}

/** Fields shared by the rule and analysis dialogs. */
export const TopicSliceFields = Object.assign(TopicDialogSection, {
  Section: TopicDialogSection,
  Facets: TopicFacetChecklist,
  Sampling: TopicSamplingField,
  AutoAnalyze: TopicAutoAnalyzeField,
  ScopeHint: TopicScanScopeHint,
});
