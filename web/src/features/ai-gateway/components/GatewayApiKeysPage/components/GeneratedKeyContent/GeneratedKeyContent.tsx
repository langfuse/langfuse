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
    <Tabs defaultValue={DEFAULT_TAB}>
      <Tabs.List variant="inset" size="md" aria-label="Setup instructions">
        {instructions.map((entry) => (
          <Tabs.Trigger key={entry.id} value={entry.id} label={entry.label} />
        ))}
      </Tabs.List>
      {instructions.map((entry) => (
        <Tabs.Content key={entry.id} value={entry.id}>
          <div className="flex flex-col gap-3 pt-4">
            <div className="flex items-center gap-2">
              <CopyForAgentButton instructions={entry} />
              <Button
                variant="ghost"
                size="sm"
                text="Read docs"
                href={entry.docsUrl}
              />
            </div>
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
  organizationId: string;
};
