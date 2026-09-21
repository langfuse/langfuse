import { Plus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { RowActions } from "@/src/features/evals/v2/components/Evaluators/DecisionModel/ChoiceOptionsEditor/ChoiceOptionsEditor";

export type ScoreLevelDraft = { description: string };

const MAX_LEVELS = 10;

function levelPlaceholder(index: number, count: number) {
  if (index === 0) return "Lowest level, e.g. Calm, just stating facts";
  if (index === count - 1) {
    return "Highest level, e.g. Very angry or threatening to leave";
  }
  return "Describe this level";
}

/**
 * Ordered levels of a Score question, low to high. The level number is its
 * position; the model only sees the descriptions, so each one has to describe
 * a recognisable situation rather than a degree.
 */
export function ScoreLevelsEditor({
  levels,
  onChange,
  error,
}: {
  levels: ScoreLevelDraft[];
  onChange: (levels: ScoreLevelDraft[]) => void;
  error?: string;
}) {
  const update = (index: number, description: string) =>
    onChange(levels.map((level, i) => (i === index ? { description } : level)));
  const remove = (index: number) =>
    onChange(levels.filter((_, i) => i !== index));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= levels.length) return;
    const next = [...levels];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        Levels, low to high
        <InfoTooltip label="About levels">
          Each level is one point on the scale. The model judges every level on
          its own against the state and returns a position between them, so
          describe situations (“broken, but a workaround exists”), not degrees
          (“moderately severe”). Two to ten levels.
        </InfoTooltip>
        <span className="text-muted-foreground text-xs font-normal">
          {levels.length} of {MAX_LEVELS}
        </span>
      </Label>
      <ol className="flex flex-col gap-1.5">
        {levels.map((level, index) => (
          <li
            key={index}
            className="grid grid-cols-[2rem_1fr_auto] items-center gap-2"
          >
            <span
              className="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-md font-mono text-xs"
              aria-hidden="true"
            >
              {index}
            </span>
            <Input
              value={level.description}
              onChange={(event) => update(index, event.target.value)}
              placeholder={levelPlaceholder(index, levels.length)}
              aria-label={`Level ${index} description`}
            />
            <RowActions
              onUp={index > 0 ? () => move(index, -1) : null}
              onDown={index < levels.length - 1 ? () => move(index, 1) : null}
              onDelete={levels.length > 2 ? () => remove(index) : null}
            />
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={levels.length >= MAX_LEVELS}
          onClick={() => onChange([...levels, { description: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add level
        </Button>
        <span className="text-muted-foreground text-xs">
          Score = 0 … {Math.max(levels.length - 1, 0)}, e.g. 1.3 sits between
          levels 1 and 2.
        </span>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
