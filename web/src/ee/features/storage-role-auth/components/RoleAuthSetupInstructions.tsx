import {
  buildStorageRoleReadPermissionPolicy,
  buildStorageRoleTrustPolicy,
} from "@langfuse/shared";

import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { MaskedExternalId } from "@/src/ee/features/storage-role-auth/components/MaskedExternalId";
import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";

export function RoleAuthSetupInstructions({
  crossAccountRoleArn,
  externalId,
  roleArn,
  bucketName,
  prefix,
}: {
  crossAccountRoleArn: string;
  externalId: RevealableExternalId;
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Let the Langfuse cross-account role assume your role with this external
        ID, then grant the role read access to the bucket. If the bucket uses
        SSE-KMS, also allow the role to use kms:Decrypt on the key.
      </p>
      <CodeSection
        title="Langfuse cross-account role"
        content={crossAccountRoleArn}
      />
      {externalId.value ? (
        <>
          <CodeSection title="External ID" content={externalId.value} />
          <CodeSection
            title="Trust policy"
            language="json"
            content={JSON.stringify(
              buildStorageRoleTrustPolicy({
                crossAccountRoleArn,
                externalId: externalId.value,
              }),
              null,
              2,
            )}
          />
        </>
      ) : (
        <MaskedExternalId
          isLoading={externalId.isLoading}
          onReveal={externalId.reveal}
        />
      )}
      <CodeSection
        title="Permission policy"
        language="json"
        content={JSON.stringify(
          buildStorageRoleReadPermissionPolicy({
            roleArn: roleArn || "arn:aws:iam::123456789012:role/role-name",
            bucketName: bucketName || "bucket-name",
            prefix,
          }),
          null,
          2,
        )}
      />
    </div>
  );
}
