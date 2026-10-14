import { IOSection } from "@/src/components/ui/IOSection";
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
  return (
    <IOSection title="Tools">
      {tools.length > 0 && (
        <ToolCallDefinitionCard
          tools={tools}
          toolCallCounts={toolCallCounts}
          toolCallsByName={toolCallsByName}
          toolNameToDefinitionNumber={toolNameToDefinitionNumber}
        />
      )}
    </IOSection>
  );
}
