/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger */
import TagCommandItem from "@/src/features/tag/components/TagCommandItem";
import { TagInput } from "@/src/features/tag/components/TagInput";
import TagList from "@/src/features/tag/components/TagList";
import { useTagManager } from "@/src/features/tag/hooks/useTagManager";
import {
  Popover,
  PopoverAnchor,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "cmdk";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { Label } from "@/src/components/ui/label";

type TagManagerProps = {
  itemName: "prompt" | "trace" | "alert";
  tags: string[];
  allTags: string[];
  hasAccess: boolean;
  isLoading: boolean;
  mutateTags: (value: string[]) => void;
  className?: string;
  isTableCell?: boolean;
  allowTagRemoval?: boolean;
  triggerButton?: React.ReactNode;
  alignPopover?: "start" | "center" | "end";
};

const TagManager = ({
  itemName,
  tags,
  allTags,
  hasAccess,
  isLoading,
  mutateTags,
  className,
  isTableCell = false,
  allowTagRemoval = true,
  triggerButton,
  alignPopover,
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
  const canCreateTag =
    inputValue !== "" &&
    !filteredTags.some(
      (value) => value.toLowerCase() === inputValue.toLowerCase(),
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
    return (
      <div
        className={cn(
          "flex gap-x-1 gap-y-1",
          !isTableCell && "flex-wrap",
          className,
        )}
      >
        <TagList
          selectedTags={selectedTags}
          isLoading={isLoading}
          viewOnly
          isTableCell={isTableCell}
        />
      </div>
    );
  }

  return (
    <Popover onOpenChange={(open) => handlePopoverChange(open)}>
      {triggerButton ? (
        <PopoverTrigger className="select-none" asChild>
          <div
            className={cn("flex cursor-pointer items-start gap-1", className)}
          >
            <PopoverAnchor asChild>{triggerButton}</PopoverAnchor>
            {selectedTags.length > 0 && (
              <div className="flex flex-1 flex-wrap gap-1">
                <TagList
                  selectedTags={selectedTags}
                  isLoading={isLoading}
                  isTableCell={isTableCell}
                />
              </div>
            )}
          </div>
        </PopoverTrigger>
      ) : (
        <PopoverTrigger
          className="select-none"
          asChild
          onClick={(e) => {
            if (isTableCell) {
              e.stopPropagation();
            }
          }}
        >
          <div
            className={cn(
              "flex gap-x-1 gap-y-1",
              !isTableCell && "flex-wrap",
              className,
            )}
          >
            <TagList
              selectedTags={selectedTags}
              isLoading={isLoading}
              isTableCell={isTableCell}
            />
          </div>
        </PopoverTrigger>
      )}
      <PopoverContent
        align={alignPopover}
        className="w-72 space-y-2"
        onClick={(e) => {
          if (isTableCell) {
            e.stopPropagation();
          }
        }}
        onKeyDown={(e) => {
          if (isTableCell) {
            e.stopPropagation();
          }
        }}
      >
        <Label className="text-base capitalize">{itemName} Tags</Label>
        <Command
          shouldFilter={false} // we do not use cmdk's filter feature as it does not support virtualization for large lists
        >
          <TagInput
            value={inputValue}
            onValueChange={setInputValue}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            allowTagRemoval={allowTagRemoval}
          />
          <CommandList>
            <CommandGroup
              heading={filteredTags.length > 0 ? "Available Tags" : ""}
              className={cn(
                "mt-2 max-h-52 overflow-auto text-sm font-bold *:[[cmdk-group-heading]]:mb-2",
                filteredTags.length > 0 && "mb-2",
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
            {canCreateTag && (
              <CommandItem
                key={inputValue}
                value={inputValue.trim()}
                className="text-muted-foreground hover:bg-secondary/80 flex min-h-8 cursor-pointer items-center rounded-sm px-3 py-1 text-sm"
                onSelect={handleItemCreate}
              >
                Create new tag: &quot;{inputValue.trim()}&quot;
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default TagManager;
