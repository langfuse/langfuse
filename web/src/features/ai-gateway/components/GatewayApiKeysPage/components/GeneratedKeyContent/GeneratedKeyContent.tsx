/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { ExpandableContentPeek } from "@/src/components/design-system/ExpandableContentPeek/ExpandableContentPeek";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AGENT_SETUP_DOCS_URLS } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { AgentSetupSteps } from "./components/AgentSetupSteps";
import { CopyForAgentButton } from "./components/CopyForAgentButton";
import { MaskedGatewayKey } from "./components/MaskedGatewayKey";
import { useAgentSetupInstructions } from "./hooks/useAgentSetupInstructions";

const DEFAULT_TAB: AgentSetupInstructions["id"] = "api";

type GeneratedKeyContentProps = {
  organizationId: string;
  secretKey: string;
  onDone: () => void;
};

export function GeneratedKeyContent({
  organizationId,
  secretKey,
  onDone,
}: GeneratedKeyContentProps) {
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_TAB);
  const { instructions, isPending, isError } =
    useAgentSetupInstructions(organizationId);
  const activeInstructions = instructions?.find(
    (entry) => entry.id === activeTab,
  );

  return (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <DialogTitle>Gateway key created</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            text="Read docs"
            href={activeInstructions?.docsUrl ?? AGENT_SETUP_DOCS_URLS.api}
          />
        </div>
        <DialogDescription>
          Copy the key now. It is shown only once.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <MaskedGatewayKey secretKey={secretKey} />
        <SetupInstructions
          instructions={instructions}
          isPending={isPending}
          isError={isError}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
        />
      </DialogBody>
      <DialogFooter className="sm:justify-between">
        {activeInstructions ? (
          <CopyForAgentButton instructions={activeInstructions} />
        ) : (
          <span />
        )}
        <Button text="Done" onClick={onDone} />
      </DialogFooter>
    </>
  );
}

function SetupInstructions({
  instructions,
  isPending,
  isError,
  activeTab,
  onActiveTabChange,
}: SetupInstructionsProps) {
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

  return (
    <Tabs value={activeTab} onValueChange={onActiveTabChange}>
      <Tabs.List variant="inset" size="md" aria-label="Setup instructions">
        {instructions.map((entry) => (
          <Tabs.Trigger key={entry.id} value={entry.id} label={entry.label} />
        ))}
      </Tabs.List>
      {instructions.map((entry) => (
        <Tabs.Content key={entry.id} value={entry.id}>
          <div className="pt-4">
            {/* Inactive tabs unmount, so switching tabs collapses the peek again. */}
            <ExpandableContentPeek expandLabel="Show all steps">
              <AgentSetupSteps instructions={entry} />
            </ExpandableContentPeek>
          </div>
        </Tabs.Content>
      ))}
    </Tabs>
  );
}

type SetupInstructionsProps = {
  instructions: AgentSetupInstructions[] | undefined;
  isPending: boolean;
  isError: boolean;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
};
