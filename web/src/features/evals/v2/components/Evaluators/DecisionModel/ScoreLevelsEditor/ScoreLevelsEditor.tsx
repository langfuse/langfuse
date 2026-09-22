import { DECISION_MODEL_LIMITS } from "@langfuse/shared";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { SortableList } from "@/src/features/evals/v2/components/SortableList/SortableList";
import { moveItem } from "@/src/features/evals/v2/fns/moveItem";

export type ScoreLevelDraft = { description: string };

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
  const canRemove = levels.length > DECISION_MODEL_LIMITS.minScoreLevels;

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        Levels, low to high
        <InfoTooltip label="About levels">
          Each level is one point on the scale. The model judges every level on
          its own against the state and returns a position between them, so
          describe situations (“broken, but a workaround exists”), not degrees
          (“moderately severe”). Two to ten levels; drag to reorder.
        </InfoTooltip>
        <span className="text-muted-foreground text-xs font-normal">
          {levels.length} of {DECISION_MODEL_LIMITS.maxScoreLevels}
        </span>
      </Label>
      <SortableList
        items={levels}
        getId={(_level, index) => `level-${index}`}
        getLabel={(_level, index) => `level ${index}`}
        onReorder={(from, to) => onChange(moveItem(levels, from, to))}
        renderItem={(level, index) => (
          <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
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
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="hover:text-destructive"
              disabled={!canRemove}
              onClick={() => remove(index)}
              title={
                canRemove
                  ? "Remove level"
                  : `Keep at least ${DECISION_MODEL_LIMITS.minScoreLevels} levels`
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={levels.length >= DECISION_MODEL_LIMITS.maxScoreLevels}
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
