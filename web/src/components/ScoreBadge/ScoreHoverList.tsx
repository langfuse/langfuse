import { numberFormatter } from "@/src/utils/numbers";

/**
 * The card lists everything up to this many names; "+N more" only past it.
 */
const MAX_HOVER_SCORES = 10;

type HoverListScore = {
  name: string;
  dataType: string;
  value?: number | null;
  stringValue?: string | null;
};

function formatScoreValue(score: Omit<HoverListScore, "name">): string {
  if (score.dataType === "NUMERIC" && score.value != null) {
    return numberFormatter(score.value, 2);
  }
  return score.stringValue ?? (score.value != null ? String(score.value) : "");
}

/**
 * Score section of the node hover card: one line per score NAME,
 * alphabetical, the grouping and order the chips use, so a card never
 * contradicts the row it explains. Reused by the chips' own "+N" hover so
 * every surface reads scores the same way.
 */
export function ScoreHoverList({
  scores,
}: {
  scores: ReadonlyArray<HoverListScore>;
}) {
  const scoreNames = Array.from(new Set(scores.map((s) => s.name))).sort();
  const visibleScoreNames = scoreNames.slice(0, MAX_HOVER_SCORES);
  const hiddenScoreCount = scoreNames.length - visibleScoreNames.length;
  const firstScoreByName = new Map<string, HoverListScore>();
  for (const score of scores) {
    if (!firstScoreByName.has(score.name))
      firstScoreByName.set(score.name, score);
  }

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
      {/* Score names are arbitrary strings, so the section says what they are. */}
      <div className="col-span-full font-bold">Scores</div>
      {visibleScoreNames.map((name) => {
        const score = firstScoreByName.get(name);
        const value = score ? formatScoreValue(score) : "";
        return (
          <div key={name} className="col-span-full grid grid-cols-subgrid">
            <dt className="text-muted-foreground truncate" title={name}>
              {name}
            </dt>
            <dd className="truncate text-right tabular-nums" title={value}>
              {value}
            </dd>
          </div>
        );
      })}
      {hiddenScoreCount > 0 ? (
        <div className="text-muted-foreground col-span-full">
          +{hiddenScoreCount} more score{hiddenScoreCount === 1 ? "" : "s"}
        </div>
      ) : null}
    </dl>
  );
}
