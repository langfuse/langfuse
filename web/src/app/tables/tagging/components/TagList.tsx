import { IconButton } from "@/src/app/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/app/design-system/Tooltip/Tooltip";
import { TagButton } from "@/src/app/tables/tagging/components/TagButton";
import { TagIcon } from "lucide-react";

type TagListProps = {
  selectedTags: string[];
  isLoading: boolean;
  viewOnly?: boolean;
  isTableCell?: boolean;
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
    <Tooltip label="Add tag" hoverableContent={false}>
      {({ getTriggerProps }) => (
        <IconButton
          {...getTriggerProps()}
          icon={TagIcon}
          label="Add tag"
          size="sm"
        />
      )}
    </Tooltip>
  );
};

export default TagList;
