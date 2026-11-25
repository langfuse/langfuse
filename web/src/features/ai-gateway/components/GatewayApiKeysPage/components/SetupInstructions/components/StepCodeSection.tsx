import { use, useState } from "react";
import { Eye, EyeOff } from "@langfuse/icons";

import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { SyntaxHighlight } from "@/src/components/design-system/SyntaxHighlight/SyntaxHighlight";
import { GatewaySecretKeyContext } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/contexts/gatewaySecretKeyContext";
import { maskSecretKey } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/maskSecretKey";
import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";

type StepCodeSectionProps = {
  code: string;
  language: string;
  onAfterCopy?: () => void;
};

/** Fills in the secret key when it is known: masked until revealed, copied in full. */
export function StepCodeSection({
  code,
  language,
  onAfterCopy,
}: StepCodeSectionProps) {
  const secretKey = use(GatewaySecretKeyContext);
  const [isRevealed, setIsRevealed] = useState(false);

  if (!secretKey || !code.includes(GATEWAY_KEY_PLACEHOLDER)) {
    return (
      <CodeSection
        variant="outline"
        content={code}
        language={language}
        shouldWrapLines={false}
        onAfterCopy={onAfterCopy}
      />
    );
  }

  const displayedKey = isRevealed
    ? secretKey.value
    : maskSecretKey(secretKey.value);

  const toggleReveal = () => {
    if (!isRevealed) secretKey.onAfterReveal?.();
    setIsRevealed(!isRevealed);
  };

  const handleAfterCopy = () => {
    onAfterCopy?.();
    secretKey.onAfterCopy?.();
  };

  return (
    <CodeSection
      variant="outline"
      content={code.replaceAll(GATEWAY_KEY_PLACEHOLDER, secretKey.value)}
      shouldWrapLines={false}
      actions={[
        {
          id: "reveal-key",
          icon: isRevealed ? EyeOff : Eye,
          label: isRevealed ? "Hide key" : "Show key",
          onClick: toggleReveal,
        },
      ]}
      onAfterCopy={handleAfterCopy}
    >
      <SyntaxHighlight
        code={code.replaceAll(GATEWAY_KEY_PLACEHOLDER, displayedKey)}
        language={language}
      >
        {({ content }) => content}
      </SyntaxHighlight>
    </CodeSection>
  );
}
