import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";

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
      <Dialog.Body separators="both">
        <Form.CopyInputField
          label="Webhook secret"
          description={[
            {
              type: "text",
              text: "Use this secret to verify webhook signatures. It is included in the ",
            },
            { type: "code", text: "x-langfuse-signature" },
            { type: "text", text: " header. " },
            { type: "strong", text: "This will not be shown again." },
          ]}
          value={webhookSecret}
          copyLabel="Copy secret"
          noCapture
        />
      </Dialog.Body>
    </Dialog>
  );
}
