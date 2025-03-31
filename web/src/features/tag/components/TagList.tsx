import { Button } from "@/src/components/ui/button";
import { TagButton } from "@/src/features/tag/components/TagButton";
import { TagIcon } from "lucide-react";

type TagListProps = {
  selectedTags: string[];
  isLoading: boolean;
  viewOnly?: boolean;
  isTableCell?: boolean;
  className?: string;
};

const TagList = ({
  selectedTags,
  isLoading,
  viewOnly = false,
  isTableCell = false,
}: TagListProps) => {
  return selectedTags.length > 0 || viewOnly ? (
    selectedTags.map((tag) => (
      <TagButton
        key={tag}
        tag={tag}
        loading={isLoading}
        viewOnly={viewOnly}
        isTableCell={isTableCell}
      />
    ))
  ) : (
    <Button variant={isTableCell ? "ghost" : "tertiary"} size="icon-xs">
      <TagIcon className="h-3.5 w-3.5" />
    </Button>
  );
};

export default TagList;
