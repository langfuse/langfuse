import { Button } from "@/src/components/design-system/Button/Button";

export function TopicsEmptyState({
  onGenerateTopics,
  canGenerateTopics,
}: TopicsEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h3 className="text-lg font-bold">Find patterns in your summaries</h3>
      <p className="text-muted-foreground max-w-sm text-sm">
        Generate topics to group similar summaries and discover recurring themes
        for this facet. Choose a time range and the facets to include in Manual
        processing.
      </p>
      <Button
        text="Generate topics"
        size="sm"
        disabled={!canGenerateTopics}
        onClick={onGenerateTopics}
      />
    </div>
  );
}

type TopicsEmptyStateProps = {
  onGenerateTopics: () => void;
  canGenerateTopics: boolean;
};
