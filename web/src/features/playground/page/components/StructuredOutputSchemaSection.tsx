import React, { useState, useCallback, useEffect } from "react";

import { usePlaygroundContext } from "@/src/features/playground/page/context";
import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { PlusIcon, PencilIcon, MinusCircle, BoxIcon } from "lucide-react";
import { type LlmSchema } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { CreateOrEditLLMSchemaDialog } from "@/src/features/playground/page/components/CreateOrEditLLMSchemaDialog";
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
import { type PlaygroundSchema } from "@/src/features/playground/page/types";

export const StructuredOutputSchemaSection = () => {
  const { structuredOutputSchema, setStructuredOutputSchema } =
    usePlaygroundContext();
  const projectId = useProjectIdFromURL();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const { data: savedSchemas = [] } = api.llmSchemas.getAll.useQuery(
    {
      projectId: projectId as string,
    },
    {
      enabled: Boolean(projectId),
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );

  const isSchemaSaved = useCallback(
    (schema: PlaygroundSchema) => {
      return savedSchemas.some(
        (savedSchema) =>
          savedSchema.id === schema.id &&
          savedSchema.description === schema.description &&
          JSON.stringify(savedSchema.schema) === JSON.stringify(schema.schema),
      );
    },
    [savedSchemas],
  );

  useEffect(() => {
    if (structuredOutputSchema && !structuredOutputSchema.existingLlmSchema) {
      const matchingSavedSchema = savedSchemas.find(
        (savedSchema) => savedSchema.name === structuredOutputSchema.name,
      );

      if (matchingSavedSchema) {
        setStructuredOutputSchema({
          ...structuredOutputSchema,
          id: matchingSavedSchema.id,
          existingLlmSchema: matchingSavedSchema,
        });
      }
    }
  }, [savedSchemas, structuredOutputSchema, setStructuredOutputSchema]);

  const handleSelectSchema = (selectedLLMSchema: LlmSchema) => {
    if (
      structuredOutputSchema &&
      structuredOutputSchema.id === selectedLLMSchema.id
    ) {
      // Schema already selected, just update it
      setStructuredOutputSchema({
        ...structuredOutputSchema,
        name: selectedLLMSchema.name,
        description: selectedLLMSchema.description,
        schema: selectedLLMSchema.schema as Record<string, unknown>,
        existingLlmSchema: selectedLLMSchema,
      });
    } else if (
      structuredOutputSchema &&
      structuredOutputSchema.name === selectedLLMSchema.name &&
      !isSchemaSaved(structuredOutputSchema)
    ) {
      // Replace unsaved schema with same name
      setStructuredOutputSchema({
        id: selectedLLMSchema.id,
        name: selectedLLMSchema.name,
        description: selectedLLMSchema.description,
        schema: selectedLLMSchema.schema as Record<string, unknown>,
        existingLlmSchema: selectedLLMSchema,
      });
    } else {
      // New schema
      const newPlaygroundSchema: PlaygroundSchema = {
        id: selectedLLMSchema.id,
        name: selectedLLMSchema.name,
        description: selectedLLMSchema.description,
        schema: selectedLLMSchema.schema as Record<string, unknown>,
        existingLlmSchema: selectedLLMSchema,
      };
      setStructuredOutputSchema(newPlaygroundSchema);
    }
    setIsSearchOpen(false);
  };

  const handleRemoveSchema = () => {
    setStructuredOutputSchema(null);
  };

  return (
    <div className="flex h-full flex-col pr-1">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="font-semibold">Structured Output</p>
          <a
            href="https://github.com/orgs/langfuse/discussions/3166"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
            title="Structured output is currently in beta. Click here to learn more and provide feedback!"
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
                placeholder="Search schemas..."
                className="h-8 border-none p-1 focus:ring-0 focus:ring-offset-0"
              />
              <CommandList className="max-h-[300px] overflow-y-auto">
                <CommandEmpty>No schemas found.</CommandEmpty>
                <CommandGroup>
                  {savedSchemas.map((schema) => (
                    <CommandItem
                      key={schema.id}
                      value={schema.name}
                      onSelect={() => handleSelectSchema(schema)}
                      className="flex items-center justify-between px-1 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <BoxIcon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 overflow-hidden">
                          <div className="truncate font-medium">
                            {schema.name}
                          </div>
                          <div className="line-clamp-1 text-xs text-muted-foreground">
                            {schema.description}
                          </div>
                        </div>
                      </div>
                      <CreateOrEditLLMSchemaDialog
                        projectId={projectId as string}
                        onSave={handleSelectSchema}
                        onDelete={() => handleRemoveSchema()}
                        existingLlmSchema={schema}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-2 h-7 w-7 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                      </CreateOrEditLLMSchemaDialog>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </CommandList>
              <div className="mt-auto p-1">
                <CreateOrEditLLMSchemaDialog
                  projectId={projectId as string}
                  onSave={handleSelectSchema}
                >
                  <Button variant="outline" size="default" className="w-full">
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Create new schema
                  </Button>
                </CreateOrEditLLMSchemaDialog>
              </div>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <ScrollArea className="h-[calc(100%-2rem)]">
        {!structuredOutputSchema ? (
          <div className="flex h-16 flex-col items-center justify-center p-4 text-center">
            <p className="text-xs text-muted-foreground">No schema provided.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <CreateOrEditLLMSchemaDialog
              projectId={projectId as string}
              onSave={handleSelectSchema}
              onDelete={() => handleRemoveSchema()}
              existingLlmSchema={structuredOutputSchema.existingLlmSchema}
              defaultValues={
                !isSchemaSaved(structuredOutputSchema)
                  ? {
                      name: structuredOutputSchema.name,
                      description: structuredOutputSchema.description,
                      schema: JSON.stringify(
                        structuredOutputSchema.schema,
                        null,
                        2,
                      ),
                    }
                  : undefined
              }
            >
              <div className="cursor-pointer rounded-md border bg-background p-2 transition-colors duration-200 hover:bg-accent/50">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <BoxIcon className="h-4 w-4 text-muted-foreground" />
                    <h3
                      className="max-w-[200px] truncate text-ellipsis text-sm font-medium"
                      title={structuredOutputSchema.name}
                    >
                      {structuredOutputSchema.name}
                    </h3>
                    {!isSchemaSaved(structuredOutputSchema) ? (
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
                        handleRemoveSchema();
                      }}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p
                  className="line-clamp-2 break-all text-xs text-muted-foreground"
                  title={structuredOutputSchema.description}
                >
                  {structuredOutputSchema.description}
                </p>
              </div>
            </CreateOrEditLLMSchemaDialog>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
