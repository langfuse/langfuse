/* eslint-disable @repo/no-style-props */
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useMemo, useState } from "react";
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
  className?: string;
}

type ToolTab = "called" | "not-called";

/** Above this many tools the section starts collapsed. */
const TOOLS_COLLAPSE_THRESHOLD = 5;

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

function ToolDefinitionRow({
  tool,
  isExpanded,
  onToggle,
  isCalled,
  toolCalls,
  rowNumber,
  currentView,
  setCurrentView,
}: {
  tool: ToolDefinition;
  isExpanded: boolean;
  onToggle: () => void;
  isCalled: boolean;
  toolCalls: ToolCallInvocation[];
  rowNumber: number;
  currentView: "formatted" | "json";
  setCurrentView: (value: "formatted" | "json") => void;
}) {
  const Caret = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div className="group/tool-row w-full">
      <button
        type="button"
        className={cn(
          "hover:bg-muted/20 flex w-full cursor-pointer items-center gap-2 py-1.5 text-left group-first/tool-row:pt-0",
          // Expanded details draw their own top border; keep the gap above it.
          !isExpanded && "group-last/tool-row:pb-0",
        )}
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <Caret
          className="icon-base text-icon-foreground shrink-0"
          aria-hidden
        />
        <Wrench className="text-muted-foreground icon-base shrink-0" />
        <span
          className={cn(
            "ph-no-capture block truncate text-sm",
            isCalled ? "text-foreground" : "text-muted-foreground",
          )}
          title={tool.name}
        >
          <span className="mr-1">{rowNumber}.</span>
          {tool.name}
        </span>
      </button>

      {isExpanded && (
        // Indented to the tool name (caret + wrench + gaps).
        <div className="border-border border-t py-3 pl-11">
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
 * ToolCallDefinitionCard renders the Tools section: a header with a
 * collapse caret and a Called / Not called switch (only when both sides
 * have tools), and the active tab's tools as expandable rows numbered
 * from 1. Long lists start collapsed; the user's choice lasts the session.
 */
export function ToolCallDefinitionCard({
  tools,
  toolCallCounts,
  toolCallsByName,
  className,
}: ToolCallDefinitionCardProps) {
  const [expandedToolKey, setExpandedToolKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ToolTab>("called");
  const [collapsedPreference, setCollapsedPreference] = useSessionStorage<
    boolean | null
  >("toolsSectionCollapsed", null);
  const [currentView, setCurrentView] = useLocalStorage<"formatted" | "json">(
    "toolCallPillViewPreference",
    "formatted",
  );

  const { calledTools, notCalledTools } = useMemo(
    () =>
      tools.reduce(
        (groups, tool) => {
          if ((toolCallCounts.get(tool.name) ?? 0) > 0) {
            groups.calledTools.push(tool);
          } else {
            groups.notCalledTools.push(tool);
          }
          return groups;
        },
        {
          calledTools: [] as ToolDefinition[],
          notCalledTools: [] as ToolDefinition[],
        },
      ),
    [tools, toolCallCounts],
  );

  const hasSwitch = calledTools.length > 0 && notCalledTools.length > 0;
  const tabTools = activeTab === "called" ? calledTools : notCalledTools;
  const visibleTools = hasSwitch ? tabTools : tools;
  const isCollapsed =
    collapsedPreference ?? tools.length > TOOLS_COLLAPSE_THRESHOLD;
  const Caret = isCollapsed ? ChevronRight : ChevronDown;

  const handleCollapseToggle = () => setCollapsedPreference(!isCollapsed);

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="io-message-header flex items-center justify-between gap-2 px-1 py-1">
        <button
          type="button"
          onClick={handleCollapseToggle}
          aria-expanded={!isCollapsed}
          className="focus-visible:ring-ring flex items-center gap-1.5 rounded-sm text-base font-bold focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <Caret
            aria-hidden="true"
            className="icon-base text-icon-foreground shrink-0"
          />
          Tools
        </button>
        {hasSwitch && !isCollapsed && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ToolTab)}
          >
            <Tabs.List variant="inset" size="sm">
              <Tabs.Trigger
                value="called"
                label="Called"
                count={calledTools.length}
              />
              <Tabs.Trigger
                value="not-called"
                label="Not called"
                count={notCalledTools.length}
              />
            </Tabs.List>
          </Tabs>
        )}
      </div>
      {!isCollapsed && (
        <div className="divide-border flex flex-col divide-y">
          {visibleTools.map((tool, index) => {
            const toolKey = `${activeTab}-${tool.name}-${index}`;

            return (
              <ToolDefinitionRow
                key={toolKey}
                tool={tool}
                isExpanded={expandedToolKey === toolKey}
                onToggle={() =>
                  setExpandedToolKey((current) =>
                    current === toolKey ? null : toolKey,
                  )
                }
                isCalled={(toolCallCounts.get(tool.name) ?? 0) > 0}
                toolCalls={toolCallsByName?.get(tool.name) ?? []}
                rowNumber={index + 1}
                currentView={currentView}
                setCurrentView={setCurrentView}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
