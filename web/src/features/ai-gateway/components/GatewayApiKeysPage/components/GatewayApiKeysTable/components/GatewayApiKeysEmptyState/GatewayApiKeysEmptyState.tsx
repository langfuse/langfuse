import { Bot, UserRound } from "@langfuse/icons";

import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GatewayKeySwitchboard } from "./GatewayKeySwitchboard";

/** The page header holds the actions, so the placeholder only explains keys. */
export function GatewayApiKeysEmptyState() {
  return (
    <GatewayPlaceholder.Frame
      title="No gateway keys yet"
      description="Create a gateway key to send requests through the AI Gateway from Claude Code, Codex, or your own code."
    >
      <GatewayPlaceholder.Diagram>
        <div className="mx-auto aspect-[470/160] w-full max-w-lg">
          <GatewayKeySwitchboard />
        </div>
      </GatewayPlaceholder.Diagram>
      <GatewayPlaceholder.Benefits>
        <GatewayPlaceholder.Benefit
          icon={UserRound}
          title="User key"
          description="Tied to one member. Revoked when they leave the organization."
        />
        <GatewayPlaceholder.Benefit
          icon={Bot}
          title="Service account key"
          description="For apps and pipelines. Keeps working when people leave."
        />
      </GatewayPlaceholder.Benefits>
    </GatewayPlaceholder.Frame>
  );
}
