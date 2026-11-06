import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

export function RoleAuthPausedDialog() {
  return (
    <Dialog
      title="Integration saved with exports disabled"
      size="md"
      closeLabel="Done"
    >
      <Dialog.Body>
        <p>
          Your IAM role does not trust the new external ID yet. Add the trust
          policy from the AWS setup section to your role, click{" "}
          <strong>Validate</strong>, then turn exports back on.
        </p>
      </Dialog.Body>
    </Dialog>
  );
}
