import { Copy } from "@langfuse/icons";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { DividedDialogBody } from "./components/DividedDialogBody";
import { InlineCode } from "./components/InlineCode";

/** WebhookSecretDialog shows a just-created webhook automation's signing secret, which is never shown again. */
export function WebhookSecretDialog({
  automationName,
  webhookSecret,
}: {
  automationName: string;
  webhookSecret: string;
}) {
  return (
    <Dialog
      title={`Automation "${automationName}" was created`}
      closeLabel="Done"
    >
      <DividedDialogBody>
        <Form.Field
          label="Webhook secret"
          description={
            <>
              Use this secret to verify webhook signatures. It is included in
              the <InlineCode isShaded>x-langfuse-signature</InlineCode> header.{" "}
              <strong className="text-foreground font-bold">
                This will not be shown again.
              </strong>
            </>
          }
        >
          {(field) => (
            <div className="ph-no-capture grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Input
                id={field.id}
                value={webhookSecret}
                aria-describedby={field.inputDescribedById}
                readOnly
              />
              <IconButton
                icon={Copy}
                label="Copy secret"
                variant="outline"
                onClick={() => copySecret(webhookSecret)}
              />
            </div>
          )}
        </Form.Field>
      </DividedDialogBody>
    </Dialog>
  );
}

/** copySecret copies the secret and confirms the outcome, since it is never shown again. */
async function copySecret(webhookSecret: string) {
  try {
    await copyTextToClipboard(webhookSecret);
    showSuccessToast({
      operation: "automation.create",
      title: "Webhook secret copied",
      description: "Store it somewhere safe; it will not be shown again.",
    });
  } catch {
    showErrorToast("Copy failed", "Select the secret and copy it manually.", {
      operation: "automation.create",
      errorOrigin: "frontend",
      errorCategory: "product_state",
    });
  }
}
