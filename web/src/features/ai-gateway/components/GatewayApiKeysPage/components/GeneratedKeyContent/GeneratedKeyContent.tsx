import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { SetupInstructions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/SetupInstructions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { MaskedGatewayKey } from "./components/MaskedGatewayKey";

type GeneratedKeyContentProps = {
  organizationId: string;
  secretKey: string;
};

export function GeneratedKeyContent({
  organizationId,
  secretKey,
}: GeneratedKeyContentProps) {
  const capture = usePostHogClientCapture();

  const handleAfterSecretCopy = () =>
    capture("ai_gateway:api_key_secret_copied", { orgId: organizationId });
  const handleAfterSecretReveal = () =>
    capture("ai_gateway:api_key_secret_revealed", { orgId: organizationId });

  return (
    <Dialog.Body>
      <p className="text-muted-foreground">
        Copy the key now. It is shown only once.
      </p>
      <MaskedGatewayKey
        secretKey={secretKey}
        onAfterCopy={handleAfterSecretCopy}
        onAfterReveal={handleAfterSecretReveal}
      />
      <hr className="-mx-4" />
      <SetupInstructions
        organizationId={organizationId}
        secretKey={{
          value: secretKey,
          onAfterCopy: handleAfterSecretCopy,
          onAfterReveal: handleAfterSecretReveal,
        }}
      />
    </Dialog.Body>
  );
}
