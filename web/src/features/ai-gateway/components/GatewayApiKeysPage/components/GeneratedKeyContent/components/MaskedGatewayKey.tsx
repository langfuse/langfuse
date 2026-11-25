import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { maskSecretKey } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/maskSecretKey";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

type MaskedGatewayKeyProps = {
  secretKey: string;
  onAfterCopy?: () => void;
  onAfterReveal?: () => void;
};

export function MaskedGatewayKey({
  secretKey,
  onAfterCopy,
  onAfterReveal,
}: MaskedGatewayKeyProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const { copy, isCopied } = useCopyToClipboard();
  const revealLabel = isRevealed ? "Hide key" : "Show key";
  const copyLabel = isCopied ? "Copied" : "Copy key";

  const toggleReveal = () => {
    if (!isRevealed) onAfterReveal?.();
    setIsRevealed(!isRevealed);
  };
  const handleCopy = async () => {
    try {
      await copy(secretKey);
      onAfterCopy?.();
    } catch {
      // The key is shown only once, so a denied clipboard write must leave
      // it selectable by hand.
      setIsRevealed(true);
    }
  };

  return (
    <div className="ph-no-capture bg-background flex items-center gap-2 rounded-md border py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 font-mono text-sm break-all">
        {isRevealed ? secretKey : maskSecretKey(secretKey)}
      </code>
      <Tooltip label={revealLabel}>
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={isRevealed ? EyeOff : Eye}
            label={revealLabel}
            size="sm"
            variant="outline"
            aria-pressed={isRevealed}
            onClick={toggleReveal}
          />
        )}
      </Tooltip>
      <Tooltip label={copyLabel}>
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={isCopied ? Check : Copy}
            label={copyLabel}
            size="sm"
            variant="outline"
            onClick={handleCopy}
          />
        )}
      </Tooltip>
    </div>
  );
}
