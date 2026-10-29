import { useState } from "react";
import { Braces, SquareTerminal, type IconComponent } from "@langfuse/icons";
import { SiClaude, SiGithubcopilot, SiOpenai } from "@langfuse/icons/si";

import { Button } from "@/src/components/design-system/Button/Button";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { AgentInstructionsPanel } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/components/AgentInstructionsPanel";
import {
  ClaudeSetupTabs,
  type ClaudeAgentId,
} from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/components/ClaudeSetupTabs";

type TabId = Exclude<AgentSetupInstructions["id"], ClaudeAgentId> | "claude";

const DEFAULT_TAB: TabId = "api";

const TABS: { id: TabId; label: string; icon: IconComponent }[] = [
  { id: "api", label: "API", icon: Braces },
  { id: "claude", label: "Claude", icon: SiClaude },
  { id: "codex", label: "Codex", icon: SiOpenai },
  { id: "opencode", label: "OpenCode", icon: SquareTerminal },
  { id: "copilot-cli", label: "Copilot CLI", icon: SiGithubcopilot },
];

type SetupInstructionsTabsProps = {
  organizationId: string;
  instructions: AgentSetupInstructions[];
};

export function SetupInstructionsTabs({
  organizationId,
  instructions,
}: SetupInstructionsTabsProps) {
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_TAB);
  const [claudeVariant, setClaudeVariant] =
    useState<ClaudeAgentId>("claude-code");

  const findEntry = (id: string) =>
    instructions.find((entry) => entry.id === id);
  const activeEntry =
    findEntry(activeTab === "claude" ? claudeVariant : activeTab) ??
    instructions[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h3 className="font-bold">Usage instructions</h3>
        <p className="text-muted-foreground">
          Call the gateway from your code or connect an AI tool to it. Each tab
          has the steps for one tool.{" "}
          {activeEntry ? (
            <Button
              variant="text"
              text={
                activeEntry.id === "api"
                  ? "How to call the gateway API"
                  : `How to connect ${activeEntry.label}`
              }
              href={activeEntry.docsUrl}
            />
          ) : null}
        </p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex h-9 items-center border-b">
          <Tabs.List
            variant="underline"
            overflow="menu"
            aria-label="Setup instructions"
          >
            {TABS.map((tab) => (
              <Tabs.Trigger
                key={tab.id}
                value={tab.id}
                label={tab.label}
                icon={tab.icon}
              />
            ))}
          </Tabs.List>
        </div>
        {TABS.map((tab) => {
          if (tab.id === "claude") {
            return (
              <Tabs.Content key={tab.id} value={tab.id}>
                <div className="pt-4">
                  <ClaudeSetupTabs
                    organizationId={organizationId}
                    instructions={instructions}
                    value={claudeVariant}
                    onValueChange={setClaudeVariant}
                  />
                </div>
              </Tabs.Content>
            );
          }
          const entry = findEntry(tab.id);
          return entry ? (
            <Tabs.Content key={tab.id} value={tab.id}>
              <div className="pt-4">
                <AgentInstructionsPanel
                  organizationId={organizationId}
                  instructions={entry}
                />
              </div>
            </Tabs.Content>
          ) : null;
        })}
      </Tabs>
    </div>
  );
}
