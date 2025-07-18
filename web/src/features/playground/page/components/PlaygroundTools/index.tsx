import React, { useCallback, useEffect, useState } from "react";

import { usePlaygroundContext } from "@/src/features/playground/page/context";
import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { PlusIcon, PencilIcon, MinusCircle, WrenchIcon } from "lucide-react";
import { type LlmTool } from "@prisma/client";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { CreateOrEditLLMToolDialog } from "@/src/features/playground/page/components/CreateOrEditLLMToolDialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

import { type PlaygroundTool } from "@/src/features/playground/page/types";

export const PlaygroundTools = () => {
  const { tools, setTools } = usePlaygroundContext();
  const projectId = useProjectIdFromURL();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const { data: savedTools = [] } = api.llmTools.getAll.useQuery(
    {
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId),
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );

  const isToolSaved = useCallback(
    (tool: PlaygroundTool) => {
      return savedTools.some(
        (savedTool) =>
          savedTool.id === tool.id &&
          savedTool.description === tool.description &&
          JSON.stringify(savedTool.parameters) ===
            JSON.stringify(tool.parameters),
      );
    },
    [savedTools],
  );

  useEffect(() => {
    tools.forEach((tool, index) => {
      if (!tool.existingLlmTool) {
        const matchingSavedTool = savedTools.find(
          (savedTool) => savedTool.name === tool.name,
        );

        if (matchingSavedTool) {
          const newTools = [...tools];
          newTools[index] = {
            ...tool,
            id: matchingSavedTool.id,
            existingLlmTool: matchingSavedTool,
          };
          setTools(newTools);
        }
      }
    });
  }, [savedTools, tools, setTools]);

  const handleSelectTool = (selectedLLMTool: LlmTool) => {
    setTools((prev: PlaygroundTool[]) => {
      let existingToolIndex = -1;
      existingToolIndex = prev.findIndex((t) => t.id === selectedLLMTool.id);

      if (existingToolIndex === -1) {
        const unsavedToolIndexWithSameName = prev.findIndex(
          (t) => t.name === selectedLLMTool.name,
        );

        if (unsavedToolIndexWithSameName !== -1) {
          existingToolIndex = unsavedToolIndexWithSameName;
        }
      }

      const newTool: PlaygroundTool = {
        id: selectedLLMTool.id,
        name: selectedLLMTool.name,
        description: selectedLLMTool.description,
        parameters: selectedLLMTool.parameters as Record<string, unknown>,
        existingLlmTool: selectedLLMTool,
      };

      if (existingToolIndex !== -1) {
        const newTools = [...prev];
        newTools[existingToolIndex] = newTool;

        return newTools;
      }

      return [...prev, newTool];
    });
    setIsSearchOpen(false);
  };

  const handleRemoveTool = (toolId: string) => {
    setTools(
      (prev: PlaygroundTool[]) =>
        prev.filter((t) => !(t.id === toolId)) as PlaygroundTool[],
    );
  };

  return (
    <div className="flex h-full flex-col pr-1">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-semibold">Tools</p>
          <a
            href="https://github.com/orgs/langfuse/discussions/3166"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
            title="Tool calling is currently in beta. Click here to learn more and provide feedback!"
          >
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              Beta
            </span>
          </a>
        </div>
        <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
          <PopoverTrigger asChild>
            <Button className="h-7 w-7" variant="outline" size="icon">
              <PlusIcon size={14} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-1">
            <Command className="flex flex-col">
              <CommandInput
                placeholder="Search tools..."
                className="h-8 border-none p-1 focus:ring-0 focus:ring-offset-0"
              />
              <CommandList className="max-h-[300px] overflow-y-auto">
                <CommandEmpty>No tools found.</CommandEmpty>
                <CommandGroup>
                  {savedTools.map((tool) => (
                    <CommandItem
                      key={tool.id}
                      value={tool.name}
                      onSelect={() => handleSelectTool(tool)}
                      className="flex items-center justify-between px-1 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <WrenchIcon
                          size={12}
                          className="text-muted-foreground"
                        />
                        <div className="flex-1 overflow-hidden">
                          <div className="truncate font-medium">
                            {tool.name}
                          </div>
                          <div className="line-clamp-1 text-xs text-muted-foreground">
                            {tool.description}
                          </div>
                        </div>
                      </div>
                      <CreateOrEditLLMToolDialog
                        projectId={projectId as string}
                        onSave={handleSelectTool}
                        onDelete={() => handleRemoveTool(tool.id)}
                        existingLlmTool={tool}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-2 h-7 w-7 shrink-0"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                      </CreateOrEditLLMToolDialog>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </CommandList>
              <div className="mt-auto p-1">
                <CreateOrEditLLMToolDialog
                  projectId={projectId as string}
                  onSave={handleSelectTool}
                >
                  <Button variant="outline" size="default" className="w-full">
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Create new tool
                  </Button>
                </CreateOrEditLLMToolDialog>
              </div>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <ScrollArea className="h-[calc(100%-2rem)]">
        {tools.length === 0 ? (
          <div className="flex h-16 flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">No tools attached.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {tools.map((tool) => (
              <CreateOrEditLLMToolDialog
                key={tool.id}
                projectId={projectId as string}
                onSave={handleSelectTool}
                onDelete={() => handleRemoveTool(tool.id)}
                existingLlmTool={tool.existingLlmTool}
                defaultValues={
                  !isToolSaved(tool)
                    ? {
                        name: tool.name,
                        description: tool.description,
                        parameters: JSON.stringify(tool.parameters, null, 2),
                      }
                    : undefined
                }
              >
                <div className="cursor-pointer rounded-md border bg-background p-2 transition-colors duration-200 hover:bg-accent/50">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <WrenchIcon className="h-4 w-4 text-muted-foreground" />
                      <h3
                        className="max-w-[200px] truncate text-ellipsis text-sm font-medium"
                        title={tool.name}
                      >
                        {tool.name}
                      </h3>
                      {!isToolSaved(tool) ? (
                        <span className="rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                          Unsaved
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTool(tool.id);
                        }}
                      >
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p
                    className="line-clamp-2 break-all text-xs text-muted-foreground"
                    title={tool.description}
                  >
                    {tool.description}
                  </p>
                </div>
              </CreateOrEditLLMToolDialog>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
