import { ChevronRight, ChevronDown, Wrench } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useState } from "react";

// Tool definition extracted from messages
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

// ToolCallDefinitionCard props
export interface ToolCallDefinitionCardProps {
  tools: ToolDefinition[];
  toolCallCounts: Map<string, number>;
  toolNameToDefinitionNumber?: Map<string, number>;
  className?: string;
}

/**
 * ToolCallDefinitionCard renders expandable cards for tool definitions.
 *
 * Features:
 * - Accordion-style expansion (one tool at a time)
 * - Status badges showing call count
 * - Formatted/JSON view toggle for parameters
 * - Definition numbers for reference
 */
export function ToolCallDefinitionCard({
  tools,
  toolCallCounts,
  toolNameToDefinitionNumber,
  className,
}: ToolCallDefinitionCardProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [currentView, setCurrentView] = useLocalStorage<"formatted" | "json">(
    "toolCallPillViewPreference",
    "formatted",
  );

  if (!tools || tools.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {tools.map((tool, index) => {
        const isExpanded = expandedIndex === index;
        const callCount = toolCallCounts.get(tool.name) || 0;
        const isCalled = callCount > 0;
        const toolDefinitionNumber = toolNameToDefinitionNumber?.get(tool.name);
        const statusText =
          callCount === 0
            ? "not called"
            : callCount === 1
              ? "called"
              : `called ${callCount}x`;

        return (
          <div
            key={`${tool.name}-${index}`}
            className="w-full overflow-hidden rounded-sm border"
          >
            {/* Card header */}
            <div
              className="hover:bg-muted/20 flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5"
              onClick={() => {
                setExpandedIndex(isExpanded ? null : index);
              }}
            >
              {/* Left: Tool icon + definition number + name */}
              <div className="flex items-center gap-2">
                <Wrench className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-foreground font-mono text-xs font-medium">
                  {toolDefinitionNumber !== undefined && (
                    <span className="mr-1">{toolDefinitionNumber}.</span>
                  )}
                  {tool.name}
                </span>
              </div>

              {/* Right: Status badge + chevron indicator */}
              <div className="flex items-center gap-1.5">
                <Badge
                  variant={isCalled ? undefined : "secondary"}
                  className={cn(
                    "text-xs font-medium",
                    isCalled &&
                      "bg-light-green text-dark-green hover:bg-light-green border-transparent select-none",
                  )}
                >
                  {statusText}
                </Badge>

                {/* Chevron indicator */}
                {isExpanded ? (
                  <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                )}
              </div>
            </div>

            {/* Expanded details view */}
            {isExpanded && (
              <div className="border-border bg-muted/30 relative border-t px-4 py-3">
                {/* View toggle tabs - positioned top right */}
                <div className="absolute top-1 right-4">
                  <Tabs
                    className="h-fit py-0.5"
                    value={currentView}
                    onValueChange={(value) =>
                      setCurrentView(value as "formatted" | "json")
                    }
                  >
                    <TabsList className="h-fit p-0.5">
                      <TabsTrigger
                        value="formatted"
                        className="h-fit px-1 text-xs"
                      >
                        Formatted
                      </TabsTrigger>
                      <TabsTrigger value="json" className="h-fit px-1 text-xs">
                        JSON
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Formatted view */}
                {currentView === "formatted" && (
                  <div className="space-y-4">
                    {/* Description */}
                    {tool.description && (
                      <div>
                        <div className="text-muted-foreground mb-1.5 text-xs font-medium">
                          Description
                        </div>
                        <div className="text-foreground text-sm">
                          {tool.description}
                        </div>
                      </div>
                    )}

                    {/* Parameters */}
                    {tool.parameters && (
                      <div>
                        <div className="text-muted-foreground mb-1.5 text-xs font-medium">
                          Parameters
                        </div>
                        <PrettyJsonView
                          json={tool.parameters}
                          currentView="pretty"
                          codeClassName="text-xs"
                        />
                      </div>
                    )}

                    {/* Show message if no additional details */}
                    {!tool.description && !tool.parameters && (
                      <div className="text-muted-foreground text-sm">
                        No additional details available
                      </div>
                    )}
                  </div>
                )}

                {/* JSON view - full tool object */}
                {currentView === "json" && (
                  <PrettyJsonView
                    json={tool}
                    currentView="json"
                    codeClassName="text-xs"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
