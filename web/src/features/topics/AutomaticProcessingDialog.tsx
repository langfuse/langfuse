import { useState } from "react";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Slider } from "@/src/components/ui/Slider";
import { TOPIC_SETUP_BACKFILL_DAYS } from "./topic-setup-flow";

type AutomaticProcessingDialogProps = {
  initialEnabled: boolean;
  /** Stored sampling rate, 0 to 1. */
  initialSampling: number;
  /** Finished traces per day over the estimate window; null while unknown. */
  dailyTraces: number | null;
  /** A model slot without a model blocks turning auto-analyze on. */
  missingModel: boolean;
  saving: boolean;
  error: string | null;
  onSave: (input: { enabled: boolean; sampling: number }) => void;
};

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

function estimateLine(dailyTraces: number | null, samplePercent: number) {
  if (dailyTraces === null)
    return "Share of new traces analyzed while auto-analyze is on";
  return `~${dailyEstimate(dailyTraces, samplePercent)} new traces a day, based on the last ${TOPIC_SETUP_BACKFILL_DAYS} days`;
}

/** Dialog content; render it from `AutomaticProcessingDialogController`. */
export function AutomaticProcessingDialog({
  dailyTraces,
  error,
  initialEnabled,
  initialSampling,
  missingModel,
  onSave,
  saving,
}: AutomaticProcessingDialogProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [samplePercent, setSamplePercent] = useState(() =>
    Math.min(100, Math.max(1, Math.round(initialSampling * 100))),
  );
  const blocked = enabled && missingModel;
  return (
    <Dialog
      title="Analyze traces"
      actions={[
        {
          label: "Save",
          loading: saving,
          disabled: saving || blocked,
          onClick: () => onSave({ enabled, sampling: samplePercent / 100 }),
        },
      ]}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="topics-auto-analyze"
                className="text-sm font-bold"
              >
                Auto-analyze
              </label>
              <Switch
                id="topics-auto-analyze"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
            {blocked ? (
              <p className="text-destructive text-sm">
                Choose every model in Settings before turning this on.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">Sample rate</span>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={[samplePercent]}
                  aria-label="Sample rate"
                  onValueChange={(value) =>
                    setSamplePercent(value[0] ?? samplePercent)
                  }
                />
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  aria-label="Sample rate percent"
                  value={String(samplePercent)}
                  onChange={(event) => {
                    const percent = samplePercentFromInput(event.target.value);
                    if (percent !== null) setSamplePercent(percent);
                  }}
                />
              </div>
              <span className="text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-muted-foreground text-sm">
              {estimateLine(dailyTraces, samplePercent)}
            </p>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
