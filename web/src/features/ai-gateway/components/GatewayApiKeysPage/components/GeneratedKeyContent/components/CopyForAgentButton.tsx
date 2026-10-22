import { Check, Copy } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { formatAgentSetupMarkdown } from "@/src/features/ai-gateway/fns/agentSetupInstructions/formatAgentSetupMarkdown";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

type CopyForAgentButtonProps = {
  instructions: AgentSetupInstructions;
};

export function CopyForAgentButton({ instructions }: CopyForAgentButtonProps) {
  const { copy, isCopied } = useCopyToClipboard({ successDuration: 2_000 });

  const handleCopy = async () => {
    try {
      await copy(formatAgentSetupMarkdown(instructions));
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
    }
  };

  return (
    <Button
      variant="ghost"
      icon={isCopied ? Check : Copy}
      text={isCopied ? "Copied" : "Copy for agent"}
      onClick={handleCopy}
    />
  );
}
