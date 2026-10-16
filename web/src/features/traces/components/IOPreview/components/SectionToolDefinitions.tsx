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
 * SectionToolDefinitions renders tool definition cards at the top of IOPreview.
 *
 * Shows available tools with their call counts.
 */
export function SectionToolDefinitions({
  tools,
  toolCallCounts,
  toolCallsByName,
}: SectionToolDefinitionsProps) {
  return (
    <div className="border-border mb-4 border-b pb-4">
      <div className="io-message-header px-1 py-1 text-base font-bold capitalize">
        Tools
      </div>
      {tools.length > 0 && (
        <ToolCallDefinitionCard
          tools={tools}
          toolCallCounts={toolCallCounts}
          toolCallsByName={toolCallsByName}
        />
      )}
    </div>
  );
}
