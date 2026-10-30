import { useId, useState } from "react";
import { Check, Copy } from "@langfuse/icons";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { DividedDialogBody } from "./DividedDialogBody";
import { InlineCode } from "./InlineCode";
import { describedBy } from "../helpers/describedBy";
import { FieldHelp } from "./FieldHelp";
import { FieldWithHelp } from "./FieldWithHelp";

/** WebhookSecretDialog shows a just-created webhook automation's signing secret, which is never shown again. */
export function WebhookSecretDialog({
  automationName,
  webhookSecret,
}: {
  automationName: string;
  webhookSecret: string;
}) {
  const secretHelpId = useId();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  return (
    <Dialog
      title={`Automation "${automationName}" was created`}
      closeLabel="Done"
    >
      <DividedDialogBody>
        <FieldWithHelp>
          <Form.Field label="Webhook secret">
            {(field) => (
              <div className="flex flex-col gap-1">
                <div className="ph-no-capture grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <Input
                    id={field.id}
                    value={webhookSecret}
                    aria-describedby={describedBy(
                      field.inputDescribedById,
                      secretHelpId,
                    )}
                    readOnly
                  />
                  <IconButton
                    icon={copyIcon(copyStatus)}
                    label={copyLabel(copyStatus)}
                    variant="outline"
                    onClick={async () =>
                      setCopyStatus(await copySecret(webhookSecret))
                    }
                  />
                </div>
                {copyStatus === "failed" && (
                  <p role="alert" className="text-destructive text-sm">
                    Copy failed. Select the secret and copy it manually.
                  </p>
                )}
              </div>
            )}
          </Form.Field>
          <FieldHelp id={secretHelpId}>
            Use this secret to verify webhook signatures. It is included in the{" "}
            <InlineCode isShaded>x-langfuse-signature</InlineCode> header.{" "}
            <strong className="text-foreground font-bold">
              This will not be shown again.
            </strong>
          </FieldHelp>
        </FieldWithHelp>
      </DividedDialogBody>
    </Dialog>
  );
}

/** copySecret copies the secret and reports whether the clipboard accepted it. */
async function copySecret(webhookSecret: string): Promise<CopyStatus> {
  try {
    await copyTextToClipboard(webhookSecret);
    return "copied";
  } catch {
    return "failed";
  }
}

/** copyIcon confirms a successful copy with a check mark. */
function copyIcon(copyStatus: CopyStatus) {
  if (copyStatus === "copied") return Check;
  return Copy;
}

/** copyLabel names the copy button's state for assistive technology. */
function copyLabel(copyStatus: CopyStatus): string {
  if (copyStatus === "copied") return "Secret copied";
  return "Copy secret";
}

/** CopyStatus is the outcome of the last copy attempt. */
type CopyStatus = "idle" | "copied" | "failed";
