import { Command, CommandList, CommandGroup } from "cmdk";

import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import TagCommandItem from "@/src/features/tag/components/TagCommandItem";
import TagCreateItem from "@/src/features/tag/components/TagCreateItem";
import { TagInput } from "@/src/features/tag/components/TagInput";
import TagList from "@/src/features/tag/components/TagList";
import { useTagManager } from "@/src/features/tag/hooks/useTagManager";
import { cn } from "@/src/utils/tailwind";

/** TagManager is a controlled tag editor: parent owns `tags`, every selection change calls `mutateTags` with the next list. */
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
}: {
  itemName: "prompt" | "trace" | "monitor";
  tags: string[];
  allTags: string[];
  hasAccess: boolean;
  isLoading: boolean;
  mutateTags: (value: string[]) => void;
  className?: string;
  isTableCell?: boolean;
  allowTagRemoval?: boolean;
  /** triggerButton inserts a custom button that triggers the TagManager. */
  triggerButton?: React.ReactNode;
  alignPopover?: "start" | "center" | "end";
}) => {
  const { inputValue, availableTags, handleItemCreate, setInputValue } =
    useTagManager({ tags, allTags, mutateTags });
  const capture = usePostHogClientCapture();
  const filteredTags = availableTags.filter(
    (value) =>
      value.toLowerCase().includes(inputValue.trim().toLowerCase()) &&
      !tags.includes(value),
  );

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
          selectedTags={tags}
          isLoading={isLoading}
          viewOnly
          isTableCell={isTableCell}
        />
      </div>
    );
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          capture("tag:modal_open");
          setInputValue("");
        }
      }}
    >
      {triggerButton ? (
        // Button-as-trigger mode: clicking either the button OR any pill
        // opens the popover. PopoverAnchor pins the popup under the button
        // so its position stays stable as pills are added. The button stays
        // top-left and pills wrap inside a nested flex-wrap container so
        // they fill the column to the right of (and not under) the button.
        <PopoverTrigger className="select-none" asChild>
          <div
            className={cn("flex cursor-pointer items-start gap-1", className)}
          >
            <PopoverAnchor asChild>{triggerButton}</PopoverAnchor>
            {tags.length > 0 && (
              <div className="flex flex-1 flex-wrap gap-1">
                <TagList
                  selectedTags={tags}
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
              selectedTags={tags}
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
            selectedTags={tags}
            setSelectedTags={mutateTags}
            allowTagRemoval={allowTagRemoval}
          />
          <CommandList>
            <CommandGroup
              heading={filteredTags.length > 0 ? "Available Tags" : ""}
              className={cn(
                "mt-2 max-h-52 overflow-auto text-sm font-medium *:[[cmdk-group-heading]]:mb-2",
                filteredTags.length > 0 && "mb-2",
              )}
            >
              {filteredTags.slice(0, 20).map((value: string) => (
                <TagCommandItem
                  key={value}
                  value={value}
                  selectedTags={tags}
                  setSelectedTags={mutateTags}
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
