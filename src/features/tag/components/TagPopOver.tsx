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
import { TagInput } from "@/src/features/tag/components/TagInput";
import { TagItemCreate } from "@/src/features/tag/components/TagCreateItem";
import { TagButton } from "@/src/features/tag/components/TagButton";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";

export function TagPopOver({
  tags,
  availableTags,
  projectId,
  traceId,
  tracesFilter,
}: {
  tags: string[];
  availableTags: string[];
  projectId: string;
  traceId: string;
  tracesFilter: RouterInput["traces"]["all"];
}) {
  const [selectedTags, setSelectedTags] = useState<string[]>(tags);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const utils = api.useUtils();
  //const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });
  const mutTags = api.traces.updateTags.useMutation({
    onMutate: async () => {
      await utils.traces.all.cancel();
      setIsLoading(true);
      // Snapshot the previous value
      const prev = utils.traces.all.getData(tracesFilter);
      return { prev };
    },
    onError: (err, _newTags, context) => {
      // Rollback to the previous value if mutation fails
      utils.traces.all.setData(tracesFilter, context?.prev);
      console.log("error", err);
      setIsLoading(false);
    },
    onSettled: (data, error, { traceId, tags }) => {
      setIsLoading(false);
      utils.traces.all.setData(
        tracesFilter,
        (oldQueryData: RouterOutput["traces"]["all"] | undefined) => {
          return oldQueryData
            ? oldQueryData.map((trace) => {
                return trace.id === traceId ? { ...trace, tags } : trace;
              })
            : [];
        },
      );
    },
  });

  const allTags = useMemo(
    () => availableTags.filter((value) => !selectedTags.includes(value)),
    [availableTags, selectedTags],
  );

  const handlePopoverChange = (open: boolean) => {
    if (!open && selectedTags !== tags) {
      void mutTags.mutateAsync({
        projectId,
        traceId,
        tags: selectedTags,
      });
    }
  };

  return (
    <Popover onOpenChange={(open) => handlePopoverChange(open)}>
      <PopoverTrigger className="select-none" asChild>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
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
                  disabled={isLoading}
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

export function TagDetailsPopOver({
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
  const [isLoading, setIsLoading] = useState(false);
  const utils = api.useUtils();
  // const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });
  const mutTags = api.traces.updateTags.useMutation({
    onMutate: async () => {
      await utils.traces.byId.cancel();
      setIsLoading(true);
      // Snapshot the previous value
      const prev = utils.traces.byId.getData({ traceId });

      return { prev };
    },
    onError: (err, _newTags, context) => {
      setIsLoading(false);
      // Rollback to the previous value if mutation fails
      utils.traces.byId.setData({ traceId }, context?.prev);
    },
    onSettled: (data, error, { projectId, traceId, tags }) => {
      setIsLoading(false);
      utils.traces.byId.setData(
        { traceId },
        (oldQueryData: RouterOutput["traces"]["byId"] | undefined) => {
          return oldQueryData
            ? {
                ...oldQueryData,
                tags: tags,
              }
            : undefined;
        },
      ),
        void utils.traces.all.invalidate({ projectId });
      void utils.traces.byId.invalidate({ traceId });
    },
  });

  const allTags = useMemo(
    () => availableTags.filter((value) => !selectedTags.includes(value)),
    [availableTags, selectedTags],
  );

  const handlePopoverChange = (open: boolean) => {
    console.log("Pop Over Open: ", open);
    console.log("selectedTags: ", selectedTags);
    console.log("tags: ", tags);
    if (!open && selectedTags !== tags) {
      void mutTags.mutateAsync({
        projectId,
        traceId,
        tags: selectedTags,
      });
      console.log("Pop Up Closed: ", open);
    }
  };

  return (
    <Popover onOpenChange={(open) => handlePopoverChange(open)}>
      <PopoverTrigger className="select-none" asChild>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
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
                  disabled={isLoading}
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
