import { useCallback, useMemo, useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";
import { Check } from "lucide-react";
import { useOptimisticUpdate } from "@/src/features/tag/useOptimisticUpdate";
import { TagInput } from "@/src/features/tag/components/TagInput";
import { TagItemCreate } from "@/src/features/tag/components/TagCreateItem";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

export function TagPopOver({
  tags,
  availableTags,
  projectId,
  traceId,
}: {
  tags: string[];
  availableTags: string[];
  projectId: string;
  traceId: string;
}) {
  const [selectedTags, setSelectedTags] = useState<string[]>(tags);
  const [inputValue, setInputValue] = useState("");
  const utils = api.useUtils();
  // const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });
  const mutTags = api.traces.updateTags.useMutation({
    onSuccess: () => {
      void utils.traces.filterOptions.invalidate();
      void utils.traces.all.invalidate();
      console.log("Success");
    },
  });
  console.log("Popover selectedTags ", selectedTags);
  const { optimisticValue, loading, handleUpdate } = useOptimisticUpdate(
    tags,
    (value) =>
      mutTags.mutateAsync({
        projectId,
        traceId,
        tags: value,
      }),
  );

  const allTags = availableTags.filter(
    (value) => !selectedTags.includes(value),
  );

  return (
    <Popover
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          void handleUpdate(selectedTags);
          console.log("Pop Up Closed");
        }
      }}
    >
      <PopoverTrigger className="select-none" asChild>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {optimisticValue.length > 0 ? (
            optimisticValue.map((tag) => (
              <Button
                key={tag}
                variant="secondary"
                size="xs"
                className="text-xs font-semibold hover:bg-white"
                loading={loading}
              >
                {tag}
              </Button>
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
            selectedTags={selectedTags}
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

/* export function TagPopOverTraces({
  projectId,
  traceId,
  tags,
}: {
  projectId: string;
  traceId: string;
  tags: string[];
}) {
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });

  const updateFunction = async (newTags: string[]) => {
    await api.traces.tag.mutateAsync({
      projectId,
      traceId,
      tags: newTags,
    });
    void utils.traces.invalidate();
  };

  return (
    <TagPopOver tags={tags} onClick={hasAccess ? updateFunction : undefined} />
  );
}
 */
