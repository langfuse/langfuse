import { useId, type ReactNode } from "react";
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

/** The facets a map answers, one row each with its description. */
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
      <h3 className="text-sm font-bold">
        Facets{" "}
        <span className="text-muted-foreground font-normal">
          · What to look for
        </span>
      </h3>
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
  if (perDay === "<1") return "<1 new trace a day at this rate.";
  return `~${perDay} new ${perDay === "1" ? "trace" : "traces"} a day at this rate.`;
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
        description={perDay === null ? null : dailyVolumeLabel(perDay)}
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
        <span className="text-muted-foreground text-sm">%</span>
      </div>
    </div>
  );
}

/** Whether a map takes new traces: on is LIVE, off pauses it; `children` (the sample rate) show while on. */
function TopicLiveUpdatesField({
  on,
  onChange,
  children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <label htmlFor={id} className="text-sm leading-none font-bold">
              Live updates
            </label>
            {on ? (
              <Badge text="LIVE" size="sm" color="success" />
            ) : (
              <Badge text="PAUSED" size="sm" color="filled" />
            )}
          </span>
          <p className="text-muted-foreground text-sm">
            {on
              ? "Analyzes new matching traces as they arrive and refits nightly."
              : "Paused. The map keeps its current topics; new traces aren’t analyzed."}
          </p>
        </div>
        <Switch id={id} checked={on} onCheckedChange={onChange} />
      </div>
      {on ? children : null}
    </section>
  );
}

/** Fields shared by the rule and analysis dialogs. */
export const TopicSliceFields = Object.assign(TopicDialogSection, {
  Section: TopicDialogSection,
  Facets: TopicFacetChecklist,
  Sampling: TopicSamplingField,
  LiveUpdates: TopicLiveUpdatesField,
});
