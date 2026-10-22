import { useMemo, useState } from "react";
import { IOSection } from "@/src/components/ui/IOSection";
import useSessionStorage from "@/src/components/useSessionStorage";
import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./ToolCallDefinitionCard";
import type { ToolCallInvocation } from "../../../hooks/useChatMLParser";

// SectionToolDefinitions props
export interface SectionToolDefinitionsProps {
  tools: ToolDefinition[];
  toolCallCounts: Map<string, number>;
  toolCallsByName: Map<string, ToolCallInvocation[]>;
  /** Initial state before the user toggles; by default long lists (more than five tools) start collapsed. */
  defaultCollapsed?: boolean;
}

type ToolTab = "called" | "not-called";

/** Above this many tools the section starts collapsed. */
const TOOLS_COLLAPSE_THRESHOLD = 5;
/** The user's collapse choice lasts the session, across observations. */
const TOOLS_COLLAPSED_KEY = "toolsSectionCollapsed";

/**
 * SectionToolDefinitions renders the Tools section at the top of IOPreview:
 * an IOSection whose header carries a Called / Not called switch (only when
 * both sides have tools) over the active tab's tools, numbered from 1.
 */
export function SectionToolDefinitions({
  tools,
  toolCallCounts,
  toolCallsByName,
  defaultCollapsed,
}: SectionToolDefinitionsProps) {
  const [activeTab, setActiveTab] = useState<ToolTab>("called");
  const [storedCollapsed, setStoredCollapsed] = useSessionStorage<
    boolean | null
  >(TOOLS_COLLAPSED_KEY, null);

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

  return (
    <IOSection
      title="Tools"
      variant="table"
      collapsed={
        storedCollapsed ??
        defaultCollapsed ??
        tools.length > TOOLS_COLLAPSE_THRESHOLD
      }
      onCollapsedChange={setStoredCollapsed}
      tabs={
        hasSwitch
          ? {
              value: activeTab,
              onValueChange: (value) => setActiveTab(value as ToolTab),
              items: [
                { value: "called", label: "Called", count: calledTools.length },
                {
                  value: "not-called",
                  label: "Not called",
                  count: notCalledTools.length,
                },
              ],
            }
          : undefined
      }
    >
      <ToolCallDefinitionCard
        key={activeTab}
        tools={visibleTools}
        toolCallsByName={toolCallsByName}
      />
    </IOSection>
  );
}
