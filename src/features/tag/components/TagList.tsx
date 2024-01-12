import { forwardRef } from "react";
import { Button } from "@/src/components/ui/button";
import { TagButton } from "@/src/features/tag/components/TagButton";

type TagListProps = {
  selectedTags: string[];
  isLoading: boolean;
};

export const TagList = forwardRef<HTMLDivElement, TagListProps>(
  ({ selectedTags, isLoading }: TagListProps, ref) => {
    return (
      <div ref={ref} className="flex flex-wrap gap-x-2 gap-y-1">
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => (
            <TagButton key={tag} tag={tag} loading={isLoading} />
          ))
        ) : (
          <Button
            variant="outline"
            size="xs"
            className="text-xs font-bold opacity-0 hover:bg-white hover:opacity-100"
          >
            Add tag
          </Button>
        )}
      </div>
    );
  },
);

TagList.displayName = "TagList";

export default TagList;
