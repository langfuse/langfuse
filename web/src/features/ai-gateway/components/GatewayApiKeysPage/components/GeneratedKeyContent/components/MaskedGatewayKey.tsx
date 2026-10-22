import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

const SECRET_KEY_PREFIX = "sk-lf-";
const VISIBLE_CHARACTERS = 4;
const MASK = "•".repeat(20);

type MaskedGatewayKeyProps = {
  secretKey: string;
};

export function MaskedGatewayKey({ secretKey }: MaskedGatewayKeyProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const { copy, isCopied } = useCopyToClipboard();
  const revealLabel = isRevealed ? "Hide key" : "Show key";
  const copyLabel = isCopied ? "Copied" : "Copy key";

  const toggleReveal = () => setIsRevealed((current) => !current);
  const handleCopy = async () => {
    try {
      await copy(secretKey);
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
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

/** Keeps the `sk-lf-` prefix plus the first and last four characters readable. */
function maskSecretKey(secretKey: string) {
  const prefixLength = secretKey.startsWith(SECRET_KEY_PREFIX)
    ? SECRET_KEY_PREFIX.length
    : 0;
  const secretPart = secretKey.slice(prefixLength);
  if (secretPart.length <= VISIBLE_CHARACTERS * 2) return MASK;
  return `${secretKey.slice(0, prefixLength + VISIBLE_CHARACTERS)}${MASK}${secretKey.slice(-VISIBLE_CHARACTERS)}`;
}
