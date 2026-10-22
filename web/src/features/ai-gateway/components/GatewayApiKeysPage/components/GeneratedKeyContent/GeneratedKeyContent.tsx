import { useState } from "react";
import { Braces, SquareTerminal, type IconComponent } from "@langfuse/icons";
import { SiClaude, SiOpenai } from "@langfuse/icons/si";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { ExpandableContentPeek } from "@/src/components/design-system/ExpandableContentPeek/ExpandableContentPeek";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { AgentSetupSteps } from "./components/AgentSetupSteps";
import { CopyForAgentButton } from "./components/CopyForAgentButton";
import { MaskedGatewayKey } from "./components/MaskedGatewayKey";
import { useAgentSetupInstructions } from "./hooks/useAgentSetupInstructions";

const DEFAULT_TAB: AgentSetupInstructions["id"] = "api";

const TAB_ICONS: Record<AgentSetupInstructions["id"], IconComponent> = {
  api: Braces,
  "claude-desktop": SiClaude,
  "claude-code": SiClaude,
  codex: SiOpenai,
  opencode: SquareTerminal,
};

type GeneratedKeyContentProps = {
  organizationId: string;
  secretKey: string;
};

export function GeneratedKeyContent({
  organizationId,
  secretKey,
}: GeneratedKeyContentProps) {
  return (
    <Dialog.Body>
      <p className="text-muted-foreground">
        Copy the key now. It is shown only once.
      </p>
      <MaskedGatewayKey secretKey={secretKey} />
      <hr className="-mx-4" />
      <SetupInstructions organizationId={organizationId} />
    </Dialog.Body>
  );
}

function SetupInstructions({ organizationId }: SetupInstructionsProps) {
  const { instructions, isPending, isError } =
    useAgentSetupInstructions(organizationId);
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_TAB);

  if (isPending) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (isError || !instructions) {
    return (
      <Alert variant="destructive">
        <Alert.Title>Setup instructions could not be loaded</Alert.Title>
        <Alert.Description>
          Your key works. Follow the docs to connect your tools.
        </Alert.Description>
      </Alert>
    );
  }

  const activeEntry =
    instructions.find((entry) => entry.id === activeTab) ?? instructions[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-1">
        <h3 className="font-bold">Usage instructions</h3>
        {activeEntry ? (
          <Button
            variant="text"
            size="sm"
            text="Docs"
            href={activeEntry.docsUrl}
          />
        ) : null}
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex h-9 items-center border-b">
          <Tabs.List
            variant="underline"
            overflow="menu"
            aria-label="Setup instructions"
          >
            {instructions.map((entry) => (
              <Tabs.Trigger
                key={entry.id}
                value={entry.id}
                label={entry.label}
                icon={TAB_ICONS[entry.id]}
              />
            ))}
          </Tabs.List>
        </div>
        {instructions.map((entry) => (
          <Tabs.Content key={entry.id} value={entry.id}>
            <div className="flex flex-col items-start gap-3 pt-4">
              <CopyForAgentButton instructions={entry} />
              {/* Inactive tabs unmount, so switching tabs collapses the peek again. */}
              <div className="w-full">
                <ExpandableContentPeek expandLabel="Show all steps">
                  <AgentSetupSteps instructions={entry} />
                </ExpandableContentPeek>
              </div>
            </div>
          </Tabs.Content>
        ))}
      </Tabs>
    </div>
  );
}

type SetupInstructionsProps = {
  organizationId: string;
};
