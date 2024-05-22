import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { type Score } from "@langfuse/shared";

export const ScoresPreview = ({
  itemScoresBySource,
}: {
  itemScoresBySource: Map<string, Score[]>;
}) => {
  if (!Boolean(itemScoresBySource.size)) return null;

  return (
    <div className="flex flex-col rounded-md border">
      <span className="border-b px-3 py-1 text-xs font-medium">Scores</span>
      <div
        key={itemScoresBySource.size}
        className="grid grid-flow-row gap-2 overflow-x-auto px-3 pb-3 pt-1"
      >
        {Array.from(itemScoresBySource).map(([source, scores]) => (
          <div key={source} className="flex flex-col align-middle text-xs">
            <span className="min-w-16 p-1 font-medium">{source}</span>
            <div className="flex flex-col content-start items-start gap-1 text-nowrap">
              <GroupedScoreBadges scores={scores} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
