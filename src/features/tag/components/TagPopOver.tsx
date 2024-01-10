import React, { useMemo, useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";
import { Check } from "lucide-react";
import { useOptimisticUpdate } from "@/src/features/tag/useOptimisticUpdate";
import { TagInput } from "@/src/features/tag/components/TagInput";
import { TagItemCreate } from "@/src/features/tag/components/TagCreateItem";
import { TagButton } from "@/src/features/tag/components/TagButton";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

export function TagPopOver({
  index,
  tags,
  setTags,
  availableTags,
  projectId,
  traceId,
}: {
  index: number;
  tags: string[];
  setTags: (tags: string[]) => void;
  availableTags: string[];
  projectId: string;
  traceId: string;
}) {
  const [selectedTags, setSelectedTags] = useState<string[]>(tags);
  const [inputValue, setInputValue] = useState("");
  const utils = api.useUtils();
  // const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });
  const mutTags = api.traces.updateTags.useMutation({
    onSuccess: async () => {
      await utils.traces.filterOptions.invalidate({ projectId });
      await utils.traces.all.invalidate({ projectId });
      console.log("Success");
    },
  });

  const { optimisticValue, loading, handleUpdate } = useOptimisticUpdate(
    selectedTags,
    async (newValue: string[]) => {
      setTags(newValue);
      await mutTags.mutateAsync({
        projectId,
        traceId,
        tags: newValue,
      });
    },
  );

  const allTags = useMemo(
    () => availableTags.filter((value) => !optimisticValue.includes(value)),
    [availableTags, optimisticValue],
  );
  if (index === 0) {
    console.log("Rendered Pop Over with tags: ", tags);
    console.log("Rendered Pop Over with optimisticValue: ", optimisticValue);
    console.log("Rendered Pop Over with selectedTags: ", selectedTags);
  }

  const handlePopoverChange = (open: boolean) => {
    console.log("Pop Over Open: ", open);
    console.log("Call stack: ", new Error().stack);
    if (!open) {
      void handleUpdate(optimisticValue);
      console.log("Pop Up Closed: ", open);
    }
  };

  React.useEffect(() => {
    setSelectedTags(tags);
  }, [tags]);

  return (
    <Popover onOpenChange={(open) => handlePopoverChange(open)}>
      <PopoverTrigger className="select-none" asChild>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {optimisticValue.length > 0 ? (
            optimisticValue.map((tag) => (
              <TagButton key={tag} tag={tag} loading={loading} />
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
      </PopoverTrigger>
      <PopoverContent>
        <Command>
          <TagInput
            value={inputValue}
            onValueChange={setInputValue}
            selectedTags={optimisticValue}
            setSelectedTags={setSelectedTags}
          />
          <CommandList>
            <CommandGroup>
              {allTags.map((value: string) => (
                <CommandItem
                  key={value}
                  onSelect={() => {
                    setSelectedTags([...selectedTags, value]);
                  }}
                  disabled={loading}
                >
                  <div
                    className={cn(
                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible",
                    )}
                  >
                    <Check className={cn("h-4 w-4")} />
                  </div>
                  <Button variant="secondary" size="xs">
                    {value}
                  </Button>
                </CommandItem>
              ))}
              <TagItemCreate
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onSelect={() => {
                  setSelectedTags([...selectedTags, inputValue]);
                  availableTags.push(inputValue);
                  setInputValue("");
                }}
                inputValue={inputValue}
                options={availableTags}
              />
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
