import {
  buildStorageRoleReadPermissionPolicy,
  buildStorageRoleTrustPolicy,
} from "@langfuse/shared";

import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { MaskedExternalId } from "@/src/features/external-media-storage/components/RoleAuthSetupInstructions/MaskedExternalId";
import { type RevealableExternalId } from "@/src/features/external-media-storage/components/RoleAuthSetupInstructions/types";

export function RoleAuthSetupInstructions({
  accessRoleArn,
  externalId,
  roleArn,
  bucketName,
  prefix,
}: {
  accessRoleArn: string;
  externalId: RevealableExternalId;
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
}) {
  if (!externalId.isSet) {
    return (
      <p className="text-muted-foreground text-sm">
        Save the integration to generate the external ID for your role&apos;s
        trust policy.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Let the Langfuse access role assume your role with this external ID,
        then grant the role read access to the bucket. If the bucket uses
        SSE-KMS, also allow the role to use kms:Decrypt on the key.
      </p>
      <CodeSection title="Langfuse access role" content={accessRoleArn} />
      {externalId.value ? (
        <>
          <CodeSection title="External ID" content={externalId.value} />
          <CodeSection
            title="Trust policy"
            language="json"
            content={JSON.stringify(
              buildStorageRoleTrustPolicy({
                accessRoleArn,
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
