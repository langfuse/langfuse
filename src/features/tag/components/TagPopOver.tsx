import React, { useMemo, useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandList,
} from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import { TagInput } from "@/src/features/tag/components/TagInput";
import TagCreateItem from "@/src/features/tag/components/TagCreateItem";
import { api } from "@/src/utils/api";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import TagCommandItem from "@/src/features/tag/components/TagCommandItem";
import TagList from "@/src/features/tag/components/TagList";
import useTagManager from "@/src/features/tag/hooks/useTagManager";

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
  const {
    selectedTags,
    inputValue,
    allTags,
    handleItemCreate,
    setInputValue,
    setSelectedTags,
  } = useTagManager({ initialTags: tags, availableTags });

  const [isLoading, setIsLoading] = useState(false);

  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });
  const mutTags = api.traces.updateTags.useMutation({
    onMutate: async () => {
      await utils.traces.all.cancel();
      setIsLoading(true);
      // Snapshot the previous value
      const prevTrace = utils.traces.all.getData(tracesFilter);
      return { prevTrace };
    },
    onError: (err, _newTags, context) => {
      // Rollback to the previous value if mutation fails
      utils.traces.all.setData(tracesFilter, context?.prevTrace);
      console.log("error", err);
      setIsLoading(false);
    },
    onSettled: (data, error, { traceId, tags }) => {
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
      setIsLoading(false);
    },
  });

  const handlePopoverChange = (open: boolean) => {
    if (!open && selectedTags !== tags) {
      void mutTags.mutateAsync({
        projectId,
        traceId,
        tags: selectedTags,
      });
    }
  };

  if (!hasAccess) {
    return <TagList selectedTags={selectedTags} isLoading={isLoading} />;
  }

  return (
    <Popover onOpenChange={(open) => handlePopoverChange(open)}>
      <PopoverTrigger className="select-none">
        <TagList selectedTags={selectedTags} isLoading={isLoading} />
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
  const {
    selectedTags,
    inputValue,
    allTags,
    handleItemCreate,
    setInputValue,
    setSelectedTags,
  } = useTagManager({ initialTags: tags, availableTags });

  const [isLoading, setIsLoading] = useState(false);
  const utils = api.useUtils();
  const hasAccess = useHasAccess({ projectId, scope: "objects:tag" });
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

  const handlePopoverChange = (open: boolean) => {
    if (!open && selectedTags !== tags) {
      void mutTags.mutateAsync({
        projectId,
        traceId,
        tags: selectedTags,
      });
    }
  };

  if (!hasAccess) {
    return <TagList selectedTags={selectedTags} isLoading={isLoading} />;
  }

  return (
    <Popover onOpenChange={(open) => handlePopoverChange(open)}>
      <PopoverTrigger className="select-none">
        <TagList selectedTags={selectedTags} isLoading={isLoading} />
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
                options={availableTags}
              />
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
