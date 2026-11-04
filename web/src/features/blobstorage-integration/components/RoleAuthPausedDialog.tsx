import { STORAGE_ROLE_WRITE_ACTIONS } from "@langfuse/shared";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { ROLE_AUTH_SETUP_DESCRIPTION } from "@/src/features/blobstorage-integration/constants/roleAuthSetupDescription";
import { RoleAuthSetupInstructions } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupInstructions";
import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";

export type RoleAuthPausedDialogProps = {
  accessRoleArn: string;
  externalId: RevealableExternalId;
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
};

export function RoleAuthPausedDialog({
  accessRoleArn,
  externalId,
  roleArn,
  bucketName,
  prefix,
}: RoleAuthPausedDialogProps) {
  return (
    <Dialog
      title="Integration saved with exports disabled"
      size="md"
      closeLabel="Done"
    >
      <Dialog.Body>
        <p>
          Your role cannot trust the new external ID yet, so exports stay
          disabled for now. Add the trust policy below to your role, click
          Validate, then enable exports and save again.
        </p>
        <RoleAuthSetupInstructions
          accessRoleArn={accessRoleArn}
          externalId={externalId}
          roleArn={roleArn}
          bucketName={bucketName}
          prefix={prefix}
          actions={STORAGE_ROLE_WRITE_ACTIONS}
          description={ROLE_AUTH_SETUP_DESCRIPTION}
        />
      </Dialog.Body>
    </Dialog>
  );
}
