import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { type Score } from "@langfuse/shared";

export const ScoresPreview = ({
  itemScoresBySource,
}: {
  itemScoresBySource: Map<string, Score[]>;
}) => {
  if (!Boolean(itemScoresBySource.size)) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border py-2">
      <span className="border-b px-3 text-xs font-semibold">Scores</span>
      <div
        key={itemScoresBySource.size}
        className="grid grid-flow-row gap-2 overflow-x-auto"
      >
        {Array.from(itemScoresBySource).map(([source, scores]) => (
          <div key={source} className="flex flex-col px-3 align-middle text-xs">
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
