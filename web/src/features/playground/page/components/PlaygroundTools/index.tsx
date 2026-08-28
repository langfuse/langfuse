import React, { useCallback, useEffect } from "react";

import { usePlaygroundContext } from "@/src/features/playground/page/context";
import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { PlusIcon, PencilIcon, MinusCircle, WrenchIcon } from "lucide-react";
import { type LlmTool } from "@prisma/client";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";

import { type PlaygroundTool } from "@/src/features/playground/page/types";

/**
 * What the create/edit tool dialog should be opened with. The dialog itself is
 * owned by the parent that renders the Tools popover, so it survives the
 * popover closing (see the overlay lifecycle note in web/AGENTS.md).
 */
export type ToolDialogTarget = {
  existingLlmTool?: LlmTool;
  defaultValues?: {
    name: string;
    description: string;
    parameters: string;
  };
  /** Tool to detach from the playground when it is deleted from the project. */
  removeToolId?: string;
};

type ToolDialogProps = {
  onOpenToolDialog: (target: ToolDialogTarget) => void;
};

/** Attach/replace and detach helpers shared by the tool list and the picker. */
export const usePlaygroundToolActions = () => {
  const { setTools } = usePlaygroundContext();

  const handleSelectTool = useCallback(
    (selectedLLMTool: LlmTool) => {
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
    },
    [setTools],
  );

  const handleRemoveTool = useCallback(
    (toolId: string) => {
      setTools(
        (prev: PlaygroundTool[]) =>
          prev.filter((t) => !(t.id === toolId)) as PlaygroundTool[],
      );
    },
    [setTools],
  );

  return { handleSelectTool, handleRemoveTool };
};

// Popover content component for use in CollapsibleSection action buttons
export const PlaygroundToolsPopover = ({
  onOpenToolDialog,
}: ToolDialogProps) => {
  const projectId = useProjectIdFromURL();
  const { handleSelectTool } = usePlaygroundToolActions();

  const { data: savedTools = [] } = api.llmTools.getAll.useQuery(
    {
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId),
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );

  return (
    <Command className="flex flex-col">
      <CommandInput
        placeholder="Search tools..."
        className="h-8 border-none py-1 pr-1 pl-6 focus:ring-0 focus:ring-offset-0"
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
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <WrenchIcon
                  size={12}
                  className="text-muted-foreground shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold" title={tool.name}>
                    {tool.name}
                  </div>
                  <div className="text-muted-foreground line-clamp-1 text-xs">
                    {tool.description}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-7 w-7 shrink-0"
                aria-label={`Edit tool ${tool.name}`}
                onClick={(e) => {
                  // Editing must not also attach the tool via CommandItem.onSelect
                  e.stopPropagation();
                  onOpenToolDialog({
                    existingLlmTool: tool,
                    removeToolId: tool.id,
                  });
                }}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </Button>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
      </CommandList>
      <div className="mt-auto p-1">
        <Button
          variant="outline"
          size="default"
          className="w-full"
          onClick={() => onOpenToolDialog({})}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Create new tool
        </Button>
      </div>
    </Command>
  );
};

// Main component for embedding in CollapsibleSection content
export const PlaygroundTools = ({ onOpenToolDialog }: ToolDialogProps) => {
  const { tools, setTools } = usePlaygroundContext();
  const projectId = useProjectIdFromURL();
  const { handleRemoveTool } = usePlaygroundToolActions();

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

  const toolDialogTarget = useCallback(
    (tool: PlaygroundTool): ToolDialogTarget => ({
      existingLlmTool: tool.existingLlmTool,
      // A tool that drifted from its saved version (e.g. restored from a prompt)
      // seeds the form with the playground copy rather than the saved one.
      defaultValues: !isToolSaved(tool)
        ? {
            name: tool.name,
            description: tool.description,
            parameters: JSON.stringify(tool.parameters, null, 2),
          }
        : undefined,
      removeToolId: tool.id,
    }),
    [isToolSaved],
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

  return (
    <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-[min(45vh,18rem)]">
      {tools.length === 0 ? (
        <div className="flex h-16 flex-col items-center justify-center p-4 text-center">
          <p className="text-muted-foreground text-xs">No tools attached.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tools.map((tool) => (
            <div
              key={tool.id}
              role="button"
              tabIndex={0}
              aria-label={`Edit tool ${tool.name}`}
              className="bg-background hover:bg-accent/50 relative cursor-pointer rounded-md border p-2 pr-10 transition-colors duration-200"
              onClick={() => onOpenToolDialog(toolDialogTarget(tool))}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onOpenToolDialog(toolDialogTarget(tool));
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-3 h-6 w-6 p-0"
                aria-label={`Remove tool ${tool.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleRemoveTool(tool.id);
                }}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
                <WrenchIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold" title={tool.name}>
                    {tool.name}
                  </h3>
                  {!isToolSaved(tool) ? (
                    <span className="bg-muted text-muted-foreground mt-1 inline-flex rounded px-1 py-0.5 text-xs">
                      Unsaved
                    </span>
                  ) : null}
                </div>
                <p
                  className="text-muted-foreground col-start-2 line-clamp-2 text-xs break-words"
                  title={tool.description}
                >
                  {tool.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  );
};
