import { Button } from "@/src/components/ui/button";
import { TagButton } from "@/src/features/tag/components/TagButton";
import { TagIcon } from "lucide-react";

type TagListProps = {
  selectedTags: string[];
  isLoading: boolean;
  viewOnly?: boolean;
  showCreateOnlyOnHover?: boolean;
};

const TagList = ({
  selectedTags,
  isLoading,
  viewOnly = false,
  showCreateOnlyOnHover = false,
}: TagListProps) => {
  return selectedTags.length > 0 || viewOnly ? (
    selectedTags.map((tag) => (
      <TagButton key={tag} tag={tag} loading={isLoading} viewOnly={viewOnly} />
    ))
  ) : (
    <Button
      variant="tertiary"
      size="icon-xs"
      className={showCreateOnlyOnHover ? "opacity-0 hover:opacity-100" : ""}
    >
      <TagIcon className="h-3.5 w-3.5" />
    </Button>
  );
};

export default TagList;
