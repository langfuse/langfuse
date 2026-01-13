import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./ToolCallDefinitionCard";

// SectionToolDefinitions props
export interface SectionToolDefinitionsProps {
  tools: ToolDefinition[];
  toolCallCounts: Map<string, number>;
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
  toolNameToDefinitionNumber,
}: SectionToolDefinitionsProps) {
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
      <div className="mb-4 border-b border-border pb-4">
        <div className="io-message-header px-1 py-1 text-sm font-medium capitalize">
          Tools
        </div>
        <ToolCallDefinitionCard
          tools={tools}
          toolCallCounts={toolCallCounts}
          toolNameToDefinitionNumber={toolNameToDefinitionNumber}
          className="px-2"
        />
      </div>
    </div>
  );
}
