import TagCommandItem from "@/src/features/tag/components/TagCommandItem";
import TagCreateItem from "@/src/features/tag/components/TagCreateItem";
import { TagInput } from "@/src/features/tag/components/TagInput";
import TagList from "@/src/features/tag/components/TagList";
import { useTagManager } from "@/src/features/tag/hooks/useTagManager";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { Command, CommandList, CommandGroup } from "cmdk";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type TagManagerProps = {
  tags: string[];
  allTags: string[];
  hasAccess: boolean;
  isLoading: boolean;
  mutateTags: (value: string[]) => void;
  className?: string;
};

const TagManager = ({
  tags,
  allTags,
  hasAccess,
  isLoading,
  mutateTags,
  className,
}: TagManagerProps) => {
  const {
    selectedTags,
    inputValue,
    availableTags,
    handleItemCreate,
    setInputValue,
    setSelectedTags,
  } = useTagManager({ initialTags: tags, allTags });
  const capture = usePostHogClientCapture();
  const filteredTags = availableTags.filter(
    (value) =>
      value.toLowerCase().includes(inputValue.trim().toLowerCase()) &&
      !selectedTags.includes(value),
  );

  const handlePopoverChange = (open: boolean) => {
    if (open) {
      capture("tag:modal_open");
    }
    if (!open && selectedTags !== tags) {
      setInputValue("");
      mutateTags(selectedTags);
    }
  };

  if (!hasAccess) {
    return <TagList selectedTags={selectedTags} isLoading={isLoading} />;
  }

  return (
    <Popover onOpenChange={(open) => handlePopoverChange(open)}>
      <PopoverTrigger className="select-none" asChild>
        <div className={cn("flex gap-x-2 gap-y-1", className)}>
          <TagList selectedTags={selectedTags} isLoading={isLoading} />
        </div>
      </PopoverTrigger>
      <PopoverContent>
        <Command
          shouldFilter={false} // we do not use cmdk's filter feature as it does not support virtualization for large lists
        >
          <TagInput
            value={inputValue}
            onValueChange={setInputValue}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
          />
          <CommandList>
            <CommandGroup
              className={cn(
                "mt-2 max-h-52 overflow-auto",
                filteredTags.length > 0 && "mb-2 border-b",
              )}
            >
              {filteredTags.slice(0, 20).map((value: string) => (
                <TagCommandItem
                  key={value}
                  value={value}
                  selectedTags={selectedTags}
                  setSelectedTags={setSelectedTags}
                />
              ))}
            </CommandGroup>
            <TagCreateItem
              key={inputValue}
              onSelect={handleItemCreate}
              inputValue={inputValue}
              options={filteredTags}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default TagManager;
