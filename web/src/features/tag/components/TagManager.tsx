import { useEffect } from "react";
import TagCommandItem from "@/src/features/tag/components/TagCommandItem";
import TagCreateItem from "@/src/features/tag/components/TagCreateItem";
import { TagInput } from "@/src/features/tag/components/TagInput";
import TagList from "@/src/features/tag/components/TagList";
import { useTagManager } from "@/src/features/tag/hooks/useTagManager";
import {
  Popover,
  PopoverAnchor,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { Command, CommandList, CommandGroup } from "cmdk";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Label } from "@/src/components/ui/label";

type TagManagerProps = {
  itemName: "prompt" | "trace" | "monitor";
  tags: string[];
  allTags: string[];
  hasAccess: boolean;
  isLoading: boolean;
  mutateTags: (value: string[]) => void;
  className?: string;
  isTableCell?: boolean;
  allowTagRemoval?: boolean;
  /** When provided, this node becomes the popover trigger and the pill list
   * renders alongside it (outside the trigger). The popover anchors under
   * just this button — its position stays stable as pills are added. When
   * omitted, the existing behavior applies: clicking any pill opens the
   * popover. Used by the monitors form to surface a prominent
   * "+ Add tag" CTA. */
  triggerButton?: React.ReactNode;
  /** Popover horizontal alignment relative to its trigger. Passed straight
   * through to Radix's PopoverContent. Defaults to Radix's `"center"`. */
  popoverAlign?: "start" | "center" | "end";
  /** When true, `mutateTags` fires on every selection change instead of
   * only on popover close. Callers should only enable this if their
   * `mutateTags` is cheap (e.g. updates form state — not an API call). */
  liveUpdate?: boolean;
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
  popoverAlign,
  liveUpdate,
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

  // liveUpdate mode: push every selection change up so parents (e.g. the
  // monitor form's automation preview) can react before the popover closes.
  useEffect(() => {
    if (!liveUpdate) return;
    if (selectedTags === tags) return;
    mutateTags(selectedTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveUpdate, selectedTags]);

  // liveUpdate mode: sync external changes to `tags` into the internal
  // selectedTags so the pill list reflects updates that originate outside the
  // popover (e.g. the monitor form's per-automation toggle row).
  useEffect(() => {
    if (!liveUpdate) return;
    setSelectedTags((current) =>
      arraysShallowEqual(current, tags) ? current : tags,
    );
  }, [liveUpdate, tags, setSelectedTags]);

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
        align={popoverAlign}
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
                "mt-2 max-h-52 overflow-auto text-sm font-medium *:[[cmdk-group-heading]]:mb-2",
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

/** arraysShallowEqual returns true when both arrays carry the same string values in the same order. Used to skip redundant syncs that would otherwise churn state without changing display. */
const arraysShallowEqual = (a: string[], b: string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export default TagManager;
