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

  return (
    <Dialog.Body>
      <p className="text-muted-foreground">
        Copy the key now. It is shown only once.
      </p>
      <MaskedGatewayKey
        secretKey={secretKey}
        onAfterCopy={() =>
          capture("ai_gateway:api_key_secret_copied", { orgId: organizationId })
        }
        onAfterReveal={() =>
          capture("ai_gateway:api_key_secret_revealed", {
            orgId: organizationId,
          })
        }
      />
      <hr className="-mx-4" />
      <SetupInstructions organizationId={organizationId} />
    </Dialog.Body>
  );
}
