/* eslint-disable @repo/no-style-props */
import { ChevronDown, ChevronRight, Wrench } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useState } from "react";
import type { ToolCallInvocation } from "../../../hooks/useChatMLParser";

// Tool definition extracted from messages
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

// ToolCallDefinitionCard props
export interface ToolCallDefinitionCardProps {
  /** Rendered in order and numbered from 1. */
  tools: ToolDefinition[];
  toolCallsByName?: Map<string, ToolCallInvocation[]>;
  className?: string;
}

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
  toolCalls,
  rowNumber,
  currentView,
  setCurrentView,
}: {
  tool: ToolDefinition;
  isExpanded: boolean;
  onToggle: () => void;
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
        <Caret size="base" color="default" aria-hidden />
        <Wrench size="base" color="muted" />
        <span
          className="ph-no-capture text-foreground block truncate text-sm"
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
 * ToolCallDefinitionCard renders tools as expandable rows numbered from 1.
 * The section header, its collapse and the Called / Not called switch
 * belong to the hosting IOSection (see SectionToolDefinitions).
 */
export function ToolCallDefinitionCard({
  tools,
  toolCallsByName,
  className,
}: ToolCallDefinitionCardProps) {
  const [expandedToolKey, setExpandedToolKey] = useState<string | null>(null);
  const [currentView, setCurrentView] = useLocalStorage<"formatted" | "json">(
    "toolCallPillViewPreference",
    "formatted",
  );

  return (
    <div className={cn("divide-border flex flex-col divide-y", className)}>
      {tools.map((tool, index) => {
        const toolKey = `${tool.name}-${index}`;

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
            toolCalls={toolCallsByName?.get(tool.name) ?? []}
            rowNumber={index + 1}
            currentView={currentView}
            setCurrentView={setCurrentView}
          />
        );
      })}
    </div>
  );
}
