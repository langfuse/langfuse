import { Check, Copy } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { formatAgentSetupMarkdown } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/fns/agentSetupInstructions/formatAgentSetupMarkdown";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

type CopyForAgentButtonProps = {
  instructions: AgentSetupInstructions;
  onAfterCopy?: () => void;
};

export function CopyForAgentButton({
  instructions,
  onAfterCopy,
}: CopyForAgentButtonProps) {
  const { copy, isCopied } = useCopyToClipboard({ successDuration: 2_000 });

  const handleCopy = async () => {
    try {
      await copy(formatAgentSetupMarkdown(instructions));
      onAfterCopy?.();
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={isCopied ? Check : Copy}
      text={isCopied ? "Copied" : "Copy for agent"}
      onClick={handleCopy}
    />
  );
}
