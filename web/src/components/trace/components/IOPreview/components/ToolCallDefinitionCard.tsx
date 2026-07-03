import { ChevronRight, ChevronDown, Wrench } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useMemo, useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import type { ToolCallInvocation } from "../hooks/useChatMLParser";

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
  toolCallsByName?: Map<string, ToolCallInvocation[]>;
  toolNameToDefinitionNumber?: Map<string, number>;
  className?: string;
}

const CALLED_TOOLS_COLLAPSE_THRESHOLD = 5;
const AVAILABLE_TOOLS_COLLAPSE_THRESHOLD = 3;
const TOOL_GROUP_EXPANSION_STORAGE_KEY = "trace2-expansion:tools";

type ToolGroupExpansionState = {
  calledToolsExpanded: boolean;
  availableToolsExpanded: boolean;
};

type ToolGroupKind = "called" | "available";

function parseToolCallArguments(argumentsValue: unknown): unknown {
  if (typeof argumentsValue !== "string") {
    return argumentsValue;
  }

  try {
    return JSON.parse(argumentsValue);
  } catch {
    return argumentsValue;
  }
}

function hasToolCallArguments(argumentsValue: unknown): boolean {
  return (
    argumentsValue !== undefined &&
    argumentsValue !== null &&
    !(typeof argumentsValue === "string" && argumentsValue.trim() === "")
  );
}

function ToolCallArgumentsList({
  toolCalls,
  className,
}: {
  toolCalls: ToolCallInvocation[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolCalls.map((toolCall) => {
        const hasArguments = hasToolCallArguments(toolCall.arguments);

        return (
          <div
            key={`${toolCall.name}-${toolCall.invocationNumber}-${toolCall.id ?? ""}`}
            className="min-w-0"
          >
            <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
              <div className="text-foreground font-mono text-xs font-medium">
                Call {toolCall.invocationNumber}
              </div>
              {toolCall.id && (
                <div
                  className="text-muted-foreground truncate font-mono text-xs"
                  title={toolCall.id}
                >
                  {toolCall.id}
                </div>
              )}
            </div>
            {hasArguments ? (
              <PrettyJsonView
                json={parseToolCallArguments(toolCall.arguments)}
                currentView="pretty"
                codeClassName="text-xs"
              />
            ) : (
              <div className="text-muted-foreground rounded-sm border px-2 py-1.5 text-xs">
                No arguments
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getStatusText(callCount: number) {
  if (callCount === 0) return "not called";
  if (callCount === 1) return "called";
  return `called ${callCount}x`;
}

function ToolGroupHoverContent({
  tools,
  toolCallCounts,
  toolNameToDefinitionNumber,
}: {
  tools: ToolDefinition[];
  toolCallCounts: Map<string, number>;
  toolNameToDefinitionNumber?: Map<string, number>;
}) {
  return (
    <HoverCardContent
      side="bottom"
      align="start"
      sideOffset={6}
      className="max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-auto p-0"
    >
      <div className="flex flex-col gap-1 p-2">
        {tools.map((tool, index) => {
          const callCount = toolCallCounts.get(tool.name) ?? 0;
          const toolDefinitionNumber = toolNameToDefinitionNumber?.get(
            tool.name,
          );

          return (
            <div
              key={`${tool.name}-${index}`}
              className="flex min-w-0 items-center justify-between gap-2 rounded-sm px-2 py-1"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <span
                  className="text-foreground block truncate font-mono text-xs font-medium"
                  title={tool.name}
                >
                  {toolDefinitionNumber !== undefined && (
                    <span className="mr-1">{toolDefinitionNumber}.</span>
                  )}
                  {tool.name}
                </span>
              </div>
              <Badge
                variant={callCount > 0 ? undefined : "secondary"}
                className={cn(
                  "shrink-0 text-xs font-medium",
                  callCount > 0 &&
                    "bg-light-green text-dark-green hover:bg-light-green border-transparent select-none",
                )}
              >
                {getStatusText(callCount)}
              </Badge>
            </div>
          );
        })}
      </div>
    </HoverCardContent>
  );
}

function ToolGroupSummary({
  kind,
  tools,
  expanded,
  onToggle,
  toolCallCounts,
  toolNameToDefinitionNumber,
}: {
  kind: ToolGroupKind;
  tools: ToolDefinition[];
  expanded: boolean;
  onToggle: () => void;
  toolCallCounts: Map<string, number>;
  toolNameToDefinitionNumber?: Map<string, number>;
}) {
  const isCalledGroup = kind === "called";
  const summaryText = isCalledGroup
    ? `${tools.length} ${tools.length === 1 ? "tool was" : "tools were"} called`
    : `${tools.length} available ${tools.length === 1 ? "tool was" : "tools were"} not called`;

  const summaryButton = (
    <button
      type="button"
      className={cn(
        "hover:bg-muted/20 flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left",
        isCalledGroup &&
          "border-light-green bg-accent-light-green hover:bg-accent-light-green/80",
      )}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Wrench
          className={cn(
            "text-muted-foreground h-3.5 w-3.5 shrink-0",
            isCalledGroup && "text-dark-green",
          )}
        />
        <span
          className={cn(
            "truncate text-sm font-medium",
            isCalledGroup ? "text-dark-green" : "text-foreground",
          )}
          title={summaryText}
        >
          {summaryText}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge
          variant={isCalledGroup ? undefined : "secondary"}
          className={cn(
            "text-xs font-medium",
            isCalledGroup &&
              "bg-light-green text-dark-green hover:bg-light-green border-transparent select-none",
          )}
        >
          {expanded ? "hide" : "show"}
        </Badge>
        {expanded ? (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
        )}
      </div>
    </button>
  );

  if (expanded) {
    return summaryButton;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{summaryButton}</HoverCardTrigger>
      <ToolGroupHoverContent
        tools={tools}
        toolCallCounts={toolCallCounts}
        toolNameToDefinitionNumber={toolNameToDefinitionNumber}
      />
    </HoverCard>
  );
}

function ToolCallStatusBadge({
  isCalled,
  statusText,
  toolCalls,
}: {
  isCalled: boolean;
  statusText: string;
  toolCalls: ToolCallInvocation[];
}) {
  const badge = (
    <Badge
      variant={isCalled ? undefined : "secondary"}
      className={cn(
        "text-xs font-medium whitespace-nowrap",
        isCalled &&
          "bg-light-green text-dark-green hover:bg-light-green border-transparent select-none",
      )}
    >
      {statusText}
    </Badge>
  );

  if (!isCalled || toolCalls.length === 0) {
    return badge;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="inline-flex">{badge}</div>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-auto p-0"
      >
        <div className="border-border border-b px-3 py-2">
          <div className="text-foreground text-xs font-semibold">
            Tool call arguments
          </div>
          <div className="text-muted-foreground text-xs">
            {toolCalls.length === 1 ? "1 call" : `${toolCalls.length} calls`}
          </div>
        </div>
        <ToolCallArgumentsList toolCalls={toolCalls} className="p-3" />
      </HoverCardContent>
    </HoverCard>
  );
}

function ToolDefinitionRow({
  tool,
  isExpanded,
  onToggle,
  callCount,
  toolCalls,
  toolDefinitionNumber,
  currentView,
  setCurrentView,
}: {
  tool: ToolDefinition;
  isExpanded: boolean;
  onToggle: () => void;
  callCount: number;
  toolCalls: ToolCallInvocation[];
  toolDefinitionNumber?: number;
  currentView: "formatted" | "json";
  setCurrentView: (value: "formatted" | "json") => void;
}) {
  const isCalled = callCount > 0;
  const statusText = getStatusText(callCount);

  return (
    <div className="w-full overflow-hidden rounded-sm border">
      <button
        type="button"
        className="hover:bg-muted/20 flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span
            className="text-foreground block truncate font-mono text-xs font-medium"
            title={tool.name}
          >
            {toolDefinitionNumber !== undefined && (
              <span className="mr-1">{toolDefinitionNumber}.</span>
            )}
            {tool.name}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ToolCallStatusBadge
            isCalled={isCalled}
            statusText={statusText}
            toolCalls={toolCalls}
          />

          {isExpanded ? (
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-border bg-muted/30 relative border-t px-4 py-3">
          <div className="absolute top-1 right-4">
            <Tabs
              className="h-fit py-0.5"
              value={currentView}
              onValueChange={(value) =>
                setCurrentView(value as "formatted" | "json")
              }
            >
              <TabsList className="h-fit p-0.5">
                <TabsTrigger value="formatted" className="h-fit px-1 text-xs">
                  Formatted
                </TabsTrigger>
                <TabsTrigger value="json" className="h-fit px-1 text-xs">
                  JSON
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {currentView === "formatted" && (
            <div className="space-y-4">
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

              {toolCalls.length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1.5 text-xs font-medium">
                    Tool call arguments
                  </div>
                  <ToolCallArgumentsList toolCalls={toolCalls} />
                </div>
              )}

              {!tool.description &&
                !tool.parameters &&
                toolCalls.length === 0 && (
                  <div className="text-muted-foreground text-sm">
                    No additional details available
                  </div>
                )}
            </div>
          )}

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
  toolCallsByName,
  toolNameToDefinitionNumber,
  className,
}: ToolCallDefinitionCardProps) {
  const [expandedToolKey, setExpandedToolKey] = useState<string | null>(null);
  const [toolGroupExpansion, setToolGroupExpansion] =
    useSessionStorage<ToolGroupExpansionState>(
      TOOL_GROUP_EXPANSION_STORAGE_KEY,
      {
        calledToolsExpanded: false,
        availableToolsExpanded: false,
      },
    );
  const [currentView, setCurrentView] = useLocalStorage<"formatted" | "json">(
    "toolCallPillViewPreference",
    "formatted",
  );

  const { calledTools, availableTools } = useMemo(
    () =>
      tools.reduce(
        (groups, tool) => {
          const callCount = toolCallCounts.get(tool.name) ?? 0;
          if (callCount > 0) {
            groups.calledTools.push(tool);
          } else {
            groups.availableTools.push(tool);
          }
          return groups;
        },
        {
          calledTools: [] as ToolDefinition[],
          availableTools: [] as ToolDefinition[],
        },
      ),
    [tools, toolCallCounts],
  );

  if (!tools || tools.length === 0) {
    return null;
  }

  const calledToolsShouldCollapse =
    calledTools.length > CALLED_TOOLS_COLLAPSE_THRESHOLD;
  const availableToolsShouldCollapse =
    availableTools.length > AVAILABLE_TOOLS_COLLAPSE_THRESHOLD;
  const showCalledTools =
    !calledToolsShouldCollapse || toolGroupExpansion.calledToolsExpanded;
  const showAvailableTools =
    !availableToolsShouldCollapse || toolGroupExpansion.availableToolsExpanded;

  const renderToolRows = (
    toolsToRender: ToolDefinition[],
    groupKind: ToolGroupKind,
  ) =>
    toolsToRender.map((tool, index) => {
      const callCount = toolCallCounts.get(tool.name) || 0;
      const toolCalls = toolCallsByName?.get(tool.name) ?? [];
      const toolDefinitionNumber = toolNameToDefinitionNumber?.get(tool.name);
      const toolKey = `${groupKind}-${tool.name}-${index}`;
      const isExpanded = expandedToolKey === toolKey;

      return (
        <ToolDefinitionRow
          key={toolKey}
          tool={tool}
          isExpanded={isExpanded}
          onToggle={() =>
            setExpandedToolKey((current) =>
              current === toolKey ? null : toolKey,
            )
          }
          callCount={callCount}
          toolCalls={toolCalls}
          toolDefinitionNumber={toolDefinitionNumber}
          currentView={currentView}
          setCurrentView={setCurrentView}
        />
      );
    });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {calledToolsShouldCollapse && (
        <ToolGroupSummary
          kind="called"
          tools={calledTools}
          expanded={toolGroupExpansion.calledToolsExpanded}
          onToggle={() =>
            setToolGroupExpansion((current) => ({
              ...current,
              calledToolsExpanded: !current.calledToolsExpanded,
            }))
          }
          toolCallCounts={toolCallCounts}
          toolNameToDefinitionNumber={toolNameToDefinitionNumber}
        />
      )}
      {showCalledTools && renderToolRows(calledTools, "called")}

      {availableToolsShouldCollapse && (
        <ToolGroupSummary
          kind="available"
          tools={availableTools}
          expanded={toolGroupExpansion.availableToolsExpanded}
          onToggle={() =>
            setToolGroupExpansion((current) => ({
              ...current,
              availableToolsExpanded: !current.availableToolsExpanded,
            }))
          }
          toolCallCounts={toolCallCounts}
          toolNameToDefinitionNumber={toolNameToDefinitionNumber}
        />
      )}
      {showAvailableTools && renderToolRows(availableTools, "available")}
    </div>
  );
}
