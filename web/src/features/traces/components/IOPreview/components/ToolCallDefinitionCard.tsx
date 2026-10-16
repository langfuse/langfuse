/* eslint-disable @repo/no-style-props */
import { Wrench } from "lucide-react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useMemo, useState } from "react";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import type { ToolCallInvocation } from "../../../hooks/useChatMLParser";

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
              <div className="text-muted-foreground text-xs font-bold">
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

function ToolGroupSummary({
  kind,
  toolCount,
  expanded,
  onToggle,
}: {
  kind: ToolGroupKind;
  toolCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isCalledGroup = kind === "called";
  const summaryText = isCalledGroup
    ? `${toolCount} ${toolCount === 1 ? "tool was" : "tools were"} called`
    : `${toolCount} available ${toolCount === 1 ? "tool was" : "tools were"} not called`;

  const toggleText = expanded ? "Show less" : "Show more";
  // Quiet reveal row; padded like a tool row.
  return (
    <div className="group/tool-row">
      <div className="flex w-fit items-center gap-2 py-1.5 text-sm group-first/tool-row:pt-0 group-last/tool-row:pb-0">
        <span
          className={cn(
            "text-muted-foreground",
            isCalledGroup && "text-dark-green",
          )}
        >
          {summaryText}
        </span>
        <Button
          variant="text"
          text={toggleText}
          aria-label={`${toggleText}: ${summaryText}`}
          aria-expanded={expanded}
          onClick={onToggle}
        />
      </div>
    </div>
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
  // Fixed-width column so "called" and "not called" start at the same x.
  const badge = (
    <span className="text-muted-foreground flex w-20 items-center gap-1.5 text-xs whitespace-nowrap">
      {/* mt-px on an items-center row shifts the dot by half a pixel. */}
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isCalled && "mt-px bg-green-500 dark:bg-green-400",
        )}
        aria-hidden
      />
      {statusText}
    </span>
  );

  if (!isCalled || toolCalls.length === 0) {
    return badge;
  }

  return (
    <HoverCard
      openDelay={200}
      closeDelay={100}
      placement="bottom-end"
      sideOffset={6}
      content={
        <div className="max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-auto">
          <div className="border-border border-b px-3 py-2">
            <div className="text-foreground text-xs font-bold">
              Tool call arguments
            </div>
            <div className="text-muted-foreground text-xs">
              {toolCalls.length === 1 ? "1 call" : `${toolCalls.length} calls`}
            </div>
          </div>
          <ToolCallArgumentsList toolCalls={toolCalls} className="p-3" />
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <div className="inline-flex" tabIndex={0} {...getTriggerProps()}>
          {badge}
        </div>
      )}
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
    <div className="group/tool-row w-full">
      <button
        type="button"
        className={cn(
          "hover:bg-muted/20 flex w-full cursor-pointer items-center justify-between gap-2 py-1.5 text-left group-first/tool-row:pt-0",
          // Expanded details draw their own top border; keep the gap above it.
          !isExpanded && "group-last/tool-row:pb-0",
        )}
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Wrench className="text-muted-foreground icon-base shrink-0" />
          <span
            className={cn(
              "ph-no-capture block truncate text-sm",
              isCalled ? "text-foreground" : "text-muted-foreground",
            )}
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
            <DropdownIndicator />
          ) : (
            <DropdownIndicator direction="right" />
          )}
        </div>
      </button>

      {isExpanded && (
        // Indented to the tool name (icon-base + gap-2).
        <div className="border-border border-t py-3 pl-5.5">
          <div className="space-y-4">
            {tool.description && (
              <div>
                <div className="text-muted-foreground mb-1.5 text-xs font-bold">
                  Description
                </div>
                <div className="ph-no-capture text-muted-foreground text-sm">
                  {tool.description}
                </div>
              </div>
            )}

            {tool.parameters && (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-muted-foreground text-xs font-bold">
                    Parameters
                  </div>
                  {/* Switches the parameters table only. */}
                  <Tabs
                    value={currentView}
                    onValueChange={(value) =>
                      setCurrentView(value as "formatted" | "json")
                    }
                  >
                    <Tabs.List variant="inset" size="sm">
                      <Tabs.Trigger value="formatted" label="Formatted" />
                      <Tabs.Trigger value="json" label="Raw" />
                    </Tabs.List>
                  </Tabs>
                </div>
                <PrettyJsonView
                  json={tool.parameters}
                  currentView={currentView === "json" ? "json" : "pretty"}
                  codeClassName="text-xs"
                />
              </div>
            )}

            {toolCalls.length > 0 && (
              <div>
                <div className="text-muted-foreground mb-1.5 text-xs font-bold">
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
    <div className={cn("divide-border flex flex-col divide-y", className)}>
      {showCalledTools && renderToolRows(calledTools, "called")}
      {calledToolsShouldCollapse && (
        <ToolGroupSummary
          kind="called"
          toolCount={calledTools.length}
          expanded={toolGroupExpansion.calledToolsExpanded}
          onToggle={() =>
            setToolGroupExpansion((current) => ({
              ...current,
              calledToolsExpanded: !current.calledToolsExpanded,
            }))
          }
        />
      )}

      {showAvailableTools && renderToolRows(availableTools, "available")}
      {availableToolsShouldCollapse && (
        <ToolGroupSummary
          kind="available"
          toolCount={availableTools.length}
          expanded={toolGroupExpansion.availableToolsExpanded}
          onToggle={() =>
            setToolGroupExpansion((current) => ({
              ...current,
              availableToolsExpanded: !current.availableToolsExpanded,
            }))
          }
        />
      )}
    </div>
  );
}
