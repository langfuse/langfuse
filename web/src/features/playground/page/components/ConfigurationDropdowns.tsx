import React from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePlaygroundContext } from "../context";
import { PlaygroundTools, PlaygroundToolsPopover } from "./PlaygroundTools";
import {
  StructuredOutputSchemaSection,
  StructuredOutputSchemaPopover,
} from "./StructuredOutputSchemaSection";
import { Variables } from "./Variables";
import { MessagePlaceholders } from "./MessagePlaceholders";

export const ConfigurationDropdowns: React.FC = () => {
  const {
    tools,
    structuredOutputSchema,
    promptVariables,
    messagePlaceholders,
  } = usePlaygroundContext();

  const toolsCount = tools.length;
  const hasSchema = structuredOutputSchema ? 1 : 0;
  const variablesCount = promptVariables.length + messagePlaceholders.length;

  return (
    <div className="flex-shrink-0 border-b bg-muted/25 px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Tools Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              <span className="text-sm">Tools</span>
              {toolsCount > 0 && (
                <Badge variant="secondary" className="h-4 text-xs">
                  {toolsCount}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start">
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-medium">Tools</h4>
              <p className="text-xs text-muted-foreground">
                Configure tools for your model to use.
              </p>
            </div>
            {toolsCount > 0 ? (
              <div className="mb-3">
                <PlaygroundTools />
              </div>
            ) : (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
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
              <span className="text-sm">Schema</span>
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
              <p className="text-xs text-muted-foreground">
                Configure JSON schema for structured output.
              </p>
            </div>
            {structuredOutputSchema ? (
              <div className="mb-3">
                <StructuredOutputSchemaSection />
              </div>
            ) : (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
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
              <span className="text-sm">Variables</span>
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
              <p className="text-xs text-muted-foreground">
                Configure variables and message placeholders for your prompts.
              </p>
            </div>
            {variablesCount > 0 ? (
              <div className="mb-3 space-y-4">
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
            ) : (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
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
