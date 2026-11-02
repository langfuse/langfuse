import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { AgentInstructionsPanel } from "./AgentInstructionsPanel";

type AgentId = AgentSetupInstructions["id"];

export type AgentVariant = { id: AgentId; label: string };

type AgentVariantTabsProps = {
  organizationId: string;
  instructions: AgentSetupInstructions[];
  variants: AgentVariant[];
  ariaLabel: string;
  value: AgentId;
  onValueChange: (value: AgentId) => void;
};

/** Variants of one tool, e.g. Claude Code and Claude Desktop, share one tab with a switch between them. */
export function AgentVariantTabs({
  organizationId,
  instructions,
  variants,
  ariaLabel,
  value,
  onValueChange,
}: AgentVariantTabsProps) {
  const handleValueChange = (next: string) => {
    const variant = variants.find((v) => v.id === next);
    if (variant) onValueChange(variant.id);
  };

  return (
    <Tabs value={value} onValueChange={handleValueChange}>
      <Tabs.List variant="inset" size="sm" aria-label={ariaLabel}>
        {variants.map((variant) => (
          <Tabs.Trigger
            key={variant.id}
            value={variant.id}
            label={variant.label}
          />
        ))}
      </Tabs.List>
      {variants.map((variant) => {
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
