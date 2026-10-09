import { DECISION_MODEL_LIMITS } from "@langfuse/shared";
import { Trash2 } from "lucide-react";

import { TextActionButton } from "@/src/components/TextActionButton/TextActionButton";
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
 * Ordered score levels, low to high. The position is the level number. The
 * description is what the model reads. The stored score is that position.
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
  const update = (index: number, patch: Partial<ScoreLevelDraft>) =>
    onChange(
      levels.map((level, i) => (i === index ? { ...level, ...patch } : level)),
    );
  const remove = (index: number) =>
    onChange(levels.filter((_, i) => i !== index));
  const canRemove = levels.length > DECISION_MODEL_LIMITS.minScoreLevels;

  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-baseline gap-1.5">
        Levels, low to high
        <span className="inline-flex self-center">
          <InfoTooltip label="About levels">
            Each level is one point on the scale. The model judges every level
            on its own against the state and returns a position between them, so
            describe situations (“broken, but a workaround exists”), not degrees
            (“moderately severe”). Two to ten levels; drag to reorder.
          </InfoTooltip>
        </span>
        <span className="text-muted-foreground text-xs leading-none font-normal">
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
              onChange={(event) =>
                update(index, { description: event.target.value })
              }
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
              <Trash2 className="text-icon-foreground icon-sm" />
            </Button>
          </div>
        )}
      />
      <div className="flex items-center gap-1.5">
        <TextActionButton
          text="Add level"
          disabled={levels.length >= DECISION_MODEL_LIMITS.maxScoreLevels}
          onClick={() => onChange([...levels, { description: "" }])}
        />
        <InfoTooltip label="About the score">
          The score is the probability-weighted average of the level numbers, so
          it can be a decimal from 0 to {Math.max(levels.length - 1, 0)}.
        </InfoTooltip>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
