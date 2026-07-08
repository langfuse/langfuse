import React from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ChevronDown, Wrench, Braces, Variable } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePlaygroundContext } from "../context";
import { usePlaygroundWindowSize } from "../hooks/usePlaygroundWindowSize";
import { PlaygroundTools, PlaygroundToolsPopover } from "./PlaygroundTools";
import {
  StructuredOutputSchemaSection,
  StructuredOutputSchemaPopover,
} from "./StructuredOutputSchemaSection";
import { Variables } from "./Variables";
import { MessagePlaceholders } from "./MessagePlaceholders";

export const ConfigurationDropdowns: React.FC = () => {
  const { containerRef, width, isVeryCompact, isCompact } =
    usePlaygroundWindowSize();
  const {
    tools,
    structuredOutputSchema,
    promptVariables,
    messagePlaceholders,
  } = usePlaygroundContext();

  const toolsCount = tools.length;
  const hasSchema = structuredOutputSchema ? 1 : 0;
  const variablesCount = promptVariables.length + messagePlaceholders.length;
  const toolsPopoverWidth =
    width > 0 ? Math.min(Math.max(width - 24, 0), 320) : undefined;

  // Helper function to get responsive content (text or icon)
  const getResponsiveContent = (
    fullText: string,
    IconComponent: React.ComponentType<{ className?: string }>,
    abbreviation?: string,
  ) => {
    if (isVeryCompact) {
      return <IconComponent className="h-3 w-3" />;
    }
    if (isCompact) {
      return (
        <>
          <IconComponent className="h-3 w-3" />
          <span className="text-sm">{abbreviation ?? fullText}</span>
        </>
      );
    }
    return (
      <>
        <IconComponent className="h-3 w-3" />
        <span className="text-sm">{fullText}</span>
      </>
    );
  };

  return (
    <div ref={containerRef} className="bg-muted/25 shrink-0 border-b px-3 py-2">
      <div className="flex items-center justify-start gap-2">
        {/* Tools Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              {getResponsiveContent("Tools", Wrench)}
              {toolsCount > 0 && (
                <Badge variant="secondary" className="h-4 text-xs">
                  {toolsCount}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 max-w-[calc(100vw-1rem)] min-w-0 overflow-hidden p-4"
            align="start"
            style={toolsPopoverWidth ? { width: toolsPopoverWidth } : undefined}
          >
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-medium">Tools</h4>
              <p className="text-muted-foreground text-xs">
                Configure tools for your model to use.
              </p>
            </div>
            {toolsCount > 0 ? (
              <div className="mb-3">
                <PlaygroundTools />
              </div>
            ) : (
              <div className="mb-3">
                <p className="text-muted-foreground text-xs">
                  No tools attached.
                </p>
              </div>
            )}
            <div className="border-t pt-3">
              <PlaygroundToolsPopover />
            </div>
          </PopoverContent>
        </Popover>

        {/* Structured Output Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              {getResponsiveContent("Schema", Braces)}
              {hasSchema > 0 && (
                <Badge variant="secondary" className="h-4 text-xs">
                  {hasSchema}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start">
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-medium">Structured Output</h4>
              <p className="text-muted-foreground text-xs">
                Configure JSON schema for structured output.
              </p>
            </div>
            {structuredOutputSchema ? (
              <div className="mb-3">
                <StructuredOutputSchemaSection />
              </div>
            ) : (
              <div className="mb-3">
                <p className="text-muted-foreground text-xs">
                  No schema provided.
                </p>
              </div>
            )}
            <div className="border-t pt-3">
              <StructuredOutputSchemaPopover />
            </div>
          </PopoverContent>
        </Popover>

        {/* Variables & Placeholders Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              {getResponsiveContent("Variables", Variable, "Vars")}
              {variablesCount > 0 && (
                <Badge variant="secondary" className="h-4 text-xs">
                  {variablesCount}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start">
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-medium">
                Variables & Message Placeholders
              </h4>
              <p className="text-muted-foreground text-xs">
                Configure variables and message placeholders for your prompts.
              </p>
            </div>
            {variablesCount > 0 ? (
              <div
                className="mb-3"
                style={{ maxHeight: "50vh", overflowY: "auto" }}
              >
                <div className="space-y-4">
                  <div>
                    <h5 className="mb-2 text-xs font-medium">Variables</h5>
                    <Variables />
                  </div>
                  <div>
                    <h5 className="mb-2 text-xs font-medium">
                      Message Placeholders
                    </h5>
                    <MessagePlaceholders />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-3">
                <p className="text-muted-foreground text-xs">
                  No variables or message placeholders defined.
                </p>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
