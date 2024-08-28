import { Button } from "@/src/components/ui/button";
import { TagButton } from "@/src/features/tag/components/TagButton";

type TagListProps = {
  selectedTags: string[];
  isLoading: boolean;
  viewOnly?: boolean;
};

const TagList = ({
  selectedTags,
  isLoading,
  viewOnly = false,
}: TagListProps) => {
  return selectedTags.length > 0 || viewOnly ? (
    selectedTags.map((tag) => (
      <TagButton key={tag} tag={tag} loading={isLoading} viewOnly={viewOnly} />
    ))
  ) : (
    <Button
      variant="outline"
      size="xs"
      className="text-xs font-semibold opacity-0 hover:bg-background hover:opacity-100"
    >
      Add tag
    </Button>
  );
};

export default TagList;
