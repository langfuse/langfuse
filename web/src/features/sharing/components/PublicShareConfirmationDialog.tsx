import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

/** The confirmation itself; `onInvite` is set only for someone who may invite. */
export function PublicShareConfirmationDialog({
  kind,
  onConfirm,
  onInvite,
}: {
  kind: "trace" | "session";
  onConfirm: () => void;
  onInvite: (() => void) | undefined;
}) {
  return (
    <Dialog
      title={`Make this ${kind} public?`}
      actions={[{ label: "Make public", onClick: onConfirm }]}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-1">
          <p>Anyone with the link can view this {kind}, without signing in.</p>
          {onInvite && (
            <p className="flex flex-wrap items-center gap-x-1.5">
              <span className="font-medium">
                Only teammates need to view it?
              </span>
              <Button
                type="button"
                variant="text"
                text="Invite viewers instead"
                onClick={onInvite}
              />
            </p>
          )}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
