import { BookOpen, Bot, Plus, UserRound } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_API_KEYS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayKeySwitchboard } from "./GatewayKeySwitchboard";

export type GatewayApiKeysEmptyStateProps = {
  onCreateKey: () => void;
};

/** The key type is picked in the create dialog; the cards only explain the two types. */
export function GatewayApiKeysEmptyState({
  onCreateKey,
}: GatewayApiKeysEmptyStateProps) {
  return (
    <GatewayPlaceholder.Frame
      title="No gateway keys yet"
      description="Create a gateway key to send requests through the AI Gateway from Claude Code, Codex, or your own code."
    >
      <GatewayPlaceholder.Actions>
        <Button text="Create gateway key" icon={Plus} onClick={onCreateKey} />
        <Button
          variant="outline"
          text="How gateway keys work"
          icon={BookOpen}
          href={GATEWAY_API_KEYS_DOCS_URL}
        />
      </GatewayPlaceholder.Actions>
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
