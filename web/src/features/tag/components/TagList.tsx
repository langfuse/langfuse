import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tag, TagShell } from "@/src/components/design-system/Tag/Tag";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { TagIcon } from "@langfuse/icons";

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
  if (viewOnly) {
    return selectedTags.map((tag) => (
      <span key={tag} className="inline-flex max-w-40 min-w-0">
        <Tag text={tag} icon={TagIcon} />
      </span>
    ));
  }

  return selectedTags.length > 0 ? (
    selectedTags.map((tag) => (
      <EditableTag key={tag} tag={tag} disabled={isLoading} />
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

/** Opens the tag editor; the surrounding popover trigger handles the click. */
function EditableTag({ tag, disabled }: { tag: string; disabled: boolean }) {
  return (
    <TagShell asChild>
      <button
        type="button"
        disabled={disabled}
        className="focus-visible:ring-ring hover:bg-accent w-fit max-w-40 min-w-0 focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
      >
        <TagIcon size="sm" color="tertiary" />
        <span className="truncate py-0.5" title={tag}>
          {tag}
        </span>
      </button>
    </TagShell>
  );
}
