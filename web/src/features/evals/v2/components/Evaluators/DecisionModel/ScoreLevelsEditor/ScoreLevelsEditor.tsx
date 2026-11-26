import { DECISION_MODEL_LIMITS } from "@langfuse/shared";
import { Trash2 } from "@langfuse/icons";

import { TextActionButton } from "@/src/components/TextActionButton/TextActionButton";
import { Button } from "@/src/components/ui/button";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Input } from "@/src/components/ui/input";
import { FieldRow } from "@/src/features/evals/v2/components/Evaluators/FieldRow/FieldRow";
import { SortableList } from "@/src/components/design-system/SortableList/SortableList";
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
    <FieldRow
      label="Levels"
      size="wide"
      align="start"
      info={
        <InfoTooltip label="About levels">
          Each level is one point on the scale. The model judges every level on
          its own against the state and returns a position between them, so
          describe situations (“broken, but a workaround exists”), not degrees
          (“moderately severe”). Two to ten levels; drag to reorder.
        </InfoTooltip>
      }
    >
      <div className="flex flex-col gap-2">
        {levels.length > 0 ? (
          <SortableList
            variant="table"
            items={levels}
            getId={(_level, index) => `level-${index}`}
            getLabel={(_level, index) => `level ${index}`}
            onReorder={(from, to) => onChange(moveItem(levels, from, to))}
            renderItem={(level, index) => (
              <div className="group/row grid grid-cols-[2rem_1fr_auto] items-center gap-2">
                <span
                  className="text-foreground flex h-8 w-8 items-center px-1 font-mono text-sm"
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
                  className="text-muted-foreground h-8 border-transparent bg-transparent px-1 shadow-none"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="hover:text-destructive opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:hover)]:opacity-0"
                  disabled={!canRemove}
                  onClick={() => remove(index)}
                  title={
                    canRemove
                      ? "Remove level"
                      : `Keep at least ${DECISION_MODEL_LIMITS.minScoreLevels} levels`
                  }
                >
                  <Trash2 size="sm" color="default" />
                </Button>
              </div>
            )}
          />
        ) : null}
        <div className="flex items-center gap-1.5">
          <TextActionButton
            text="Add level"
            disabled={levels.length >= DECISION_MODEL_LIMITS.maxScoreLevels}
            onClick={() => onChange([...levels, { description: "" }])}
          />
          {levels.length >= DECISION_MODEL_LIMITS.maxScoreLevels - 1 ? (
            <span className="text-muted-foreground text-xs">
              {levels.length} of {DECISION_MODEL_LIMITS.maxScoreLevels}
            </span>
          ) : null}
          <InfoTooltip label="About the score">
            The score is the probability-weighted average of the level numbers,
            so it can be a decimal from 0 to {Math.max(levels.length - 1, 0)}.
          </InfoTooltip>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </FieldRow>
  );
}
