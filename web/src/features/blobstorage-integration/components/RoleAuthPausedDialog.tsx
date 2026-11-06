import { STORAGE_ROLE_WRITE_ACTIONS } from "@langfuse/shared";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { RoleAuthSetupInstructions } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupInstructions";
import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";

export type RoleAuthPausedDialogProps = {
  crossAccountRoleArn: string;
  externalId: RevealableExternalId;
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
};

export function RoleAuthPausedDialog({
  crossAccountRoleArn,
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
          Exports are paused. Add the trust policy below to your IAM role so
          Langfuse can assume it, then click <strong>Validate</strong> and turn
          exports back on.
        </p>
        <p className="text-muted-foreground text-sm">
          Using SSE-KMS? Also allow <code>kms:GenerateDataKey</code> and{" "}
          <code>kms:Decrypt</code> on the key.
        </p>
        <RoleAuthSetupInstructions
          crossAccountRoleArn={crossAccountRoleArn}
          externalId={externalId}
          roleArn={roleArn}
          bucketName={bucketName}
          prefix={prefix}
          actions={STORAGE_ROLE_WRITE_ACTIONS}
        />
      </Dialog.Body>
    </Dialog>
  );
}
