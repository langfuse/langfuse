import { Copy } from "@langfuse/icons";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Input
                id={field.id}
                value={webhookSecret}
                aria-describedby={field.inputDescribedById}
                disabled
              />
              <IconButton
                icon={Copy}
                label="Copy secret"
                variant="outline"
                onClick={() => copyTextToClipboard(webhookSecret)}
              />
            </div>
          )}
        </Form.Field>
      </DividedDialogBody>
    </Dialog>
  );
}
