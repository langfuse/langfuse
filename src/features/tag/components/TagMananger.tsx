import TagCommandItem from "@/src/features/tag/components/TagCommandItem";
import TagCreateItem from "@/src/features/tag/components/TagCreateItem";
import { TagInput } from "@/src/features/tag/components/TagInput";
import TagList from "@/src/features/tag/components/TagList";
import useTagManager from "@/src/features/tag/hooks/useTagManager";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { Command, CommandList, CommandGroup } from "cmdk";

type TagManagerProps = {
  tags: string[];
  allTags: string[];
  hasAccess: boolean;
  isLoading: boolean;
  mutateTags: (value: string[]) => void;
};

const TagManager = ({
  tags,
  allTags,
  hasAccess,
  isLoading,
  mutateTags,
}: TagManagerProps) => {
  const {
    selectedTags,
    inputValue,
    availableTags,
    handleItemCreate,
    setInputValue,
    setSelectedTags,
  } = useTagManager({ initialTags: tags, allTags });

  const handlePopoverChange = (open: boolean) => {
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
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <TagList selectedTags={selectedTags} isLoading={isLoading} />
        </div>
      </PopoverTrigger>
      <PopoverContent>
        <Command>
          <TagInput
            value={inputValue}
            onValueChange={setInputValue}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
          />
          <CommandList
            className={availableTags.length > 0 ? "mt-2" : undefined}
          >
            <CommandGroup>
              {availableTags.slice(0, 5).map((value: string) => (
                <TagCommandItem
                  key={value}
                  value={value}
                  selectedTags={selectedTags}
                  setSelectedTags={setSelectedTags}
                />
              ))}
              <TagCreateItem
                onSelect={handleItemCreate}
                inputValue={inputValue}
                options={allTags}
              />
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default TagManager;
