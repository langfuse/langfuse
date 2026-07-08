import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./ToolCallDefinitionCard";
import type { ToolCallInvocation } from "../hooks/useChatMLParser";

// SectionToolDefinitions props
export interface SectionToolDefinitionsProps {
  tools: ToolDefinition[];
  toolCallCounts: Map<string, number>;
  toolCallsByName: Map<string, ToolCallInvocation[]>;
  toolNameToDefinitionNumber: Map<string, number>;
}

/**
 * SectionToolDefinitions renders tool definition cards at the top of IOPreview.
 *
 * Shows available tools with their call counts and definition numbers.
 */
export function SectionToolDefinitions({
  tools,
  toolCallCounts,
  toolCallsByName,
  toolNameToDefinitionNumber,
}: SectionToolDefinitionsProps) {
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
      <div className="border-border mb-4 border-b pb-4">
        <div className="io-message-header px-1 py-1 text-sm font-medium capitalize">
          Tools
        </div>
        <ToolCallDefinitionCard
          tools={tools}
          toolCallCounts={toolCallCounts}
          toolCallsByName={toolCallsByName}
          toolNameToDefinitionNumber={toolNameToDefinitionNumber}
          className="px-2"
        />
      </div>
    </div>
  );
}
