import { Unlink } from "@langfuse/icons";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

export interface SlackDisconnectDialogProps {
  isPending: boolean;
  onConfirm: () => void;
}

export function SlackDisconnectDialog({
  isPending,
  onConfirm,
}: SlackDisconnectDialogProps) {
  return (
    <Dialog
      size="sm"
      title="Disconnect Slack?"
      actions={[
        {
          label: "Disconnect",
          icon: Unlink,
          variant: "destructive",
          loading: isPending,
          onClick: onConfirm,
        },
      ]}
    >
      <Dialog.Body>
        <p>This disconnects your Slack workspace from this project and:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Removes the bot from your Slack workspace</li>
          <li>Disables all existing Slack automations</li>
          <li>Stops all future Slack notifications</li>
          <li>Deletes stored workspace credentials</li>
        </ul>
        <p className="text-muted-foreground">
          You can reconnect at any time, but you&apos;ll need to reconfigure
          your automations.
        </p>
      </Dialog.Body>
    </Dialog>
  );
}
