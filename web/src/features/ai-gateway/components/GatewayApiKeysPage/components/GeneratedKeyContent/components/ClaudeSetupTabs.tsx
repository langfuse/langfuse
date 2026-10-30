import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { AgentInstructionsPanel } from "./AgentInstructionsPanel";

const CLAUDE_VARIANTS: { id: ClaudeAgentId; label: string }[] = [
  { id: "claude-code", label: "Code" },
  { id: "claude-desktop", label: "Desktop" },
];

function isClaudeAgentId(value: string): value is ClaudeAgentId {
  return CLAUDE_VARIANTS.some((variant) => variant.id === value);
}

type ClaudeSetupTabsProps = {
  organizationId: string;
  instructions: AgentSetupInstructions[];
  value: ClaudeAgentId;
  onValueChange: (value: ClaudeAgentId) => void;
};

/** Claude Code and Claude Desktop share one tab, with a switch between them. */
export function ClaudeSetupTabs({
  organizationId,
  instructions,
  value,
  onValueChange,
}: ClaudeSetupTabsProps) {
  const handleValueChange = (next: string) => {
    if (isClaudeAgentId(next)) onValueChange(next);
  };

  return (
    <Tabs value={value} onValueChange={handleValueChange}>
      <Tabs.List variant="inset" size="sm" aria-label="Claude app">
        {CLAUDE_VARIANTS.map((variant) => (
          <Tabs.Trigger
            key={variant.id}
            value={variant.id}
            label={variant.label}
          />
        ))}
      </Tabs.List>
      {CLAUDE_VARIANTS.map((variant) => {
        const entry = instructions.find((e) => e.id === variant.id);
        return entry ? (
          <Tabs.Content key={variant.id} value={variant.id}>
            <div className="pt-3">
              <AgentInstructionsPanel
                organizationId={organizationId}
                instructions={entry}
              />
            </div>
          </Tabs.Content>
        ) : null;
      })}
    </Tabs>
  );
}

export type ClaudeAgentId = Extract<
  AgentSetupInstructions["id"],
  "claude-code" | "claude-desktop"
>;
