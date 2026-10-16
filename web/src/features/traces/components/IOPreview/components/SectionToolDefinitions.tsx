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
}

/**
 * SectionToolDefinitions renders the tool definitions section at the top of IOPreview.
 */
export function SectionToolDefinitions({
  tools,
  toolCallCounts,
  toolCallsByName,
}: SectionToolDefinitionsProps) {
  return (
    <div className="border-border mb-4 border-b pb-4">
      <ToolCallDefinitionCard
        tools={tools}
        toolCallCounts={toolCallCounts}
        toolCallsByName={toolCallsByName}
      />
    </div>
  );
}
