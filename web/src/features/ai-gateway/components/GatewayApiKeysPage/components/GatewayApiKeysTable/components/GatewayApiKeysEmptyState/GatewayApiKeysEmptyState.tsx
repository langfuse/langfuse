import { KeyRound, Plus } from "@langfuse/icons";

import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

export function GatewayApiKeysEmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <GatewaySetupEmptyState
        icon={KeyRound}
        title="No gateway keys yet"
        description="Create a gateway key to send requests through the AI Gateway from Claude Code, Codex, or your own code."
        actions={[
          {
            type: "button",
            label: "Create key",
            icon: Plus,
            onClick: onCreate,
          },
        ]}
      />
    </div>
  );
}
