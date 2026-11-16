import Link from "next/link";

import { ActionButton } from "@/src/components/ActionButton";
import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { IntegrationCardHeader } from "@/src/features/projects/components/IntegrationCardHeader/IntegrationCardHeader";

export type ExternalMediaStorageIntegrationCardProps = {
  projectId: string;
  /** Whether the user may manage integrations (`integrations:CRUD`). */
  hasAccess: boolean;
  /** Whether the organization passes the external media storage gate. */
  hasEntitlement: boolean;
  isLoading: boolean;
  status: Status | undefined;
};

export function ExternalMediaStorageIntegrationCard({
  projectId,
  hasAccess,
  hasEntitlement,
  isLoading,
  status,
}: ExternalMediaStorageIntegrationCardProps) {
  return (
    <Card className="p-3">
      <IntegrationCardHeader
        status={status}
        isLoading={isLoading}
        hasAccess={hasAccess}
      >
        <span className="font-bold">External Media Storage</span>
      </IntegrationCardHeader>
      <p className="text-primary mb-4 text-sm">
        Resolve media referenced by s3:// URIs from your own Amazon S3 or
        S3-compatible bucket.
      </p>
      <div className="flex items-center gap-2">
        <ActionButton
          variant="secondary"
          hasAccess={hasAccess}
          hasEntitlement={hasEntitlement}
          href={`/project/${projectId}/settings/integrations/external-media-storage`}
        >
          Configure
        </ActionButton>
        <Button asChild variant="ghost">
          <Link
            href="https://langfuse.com/docs/observability/features/multi-modality#external-s3-media"
            target="_blank"
          >
            Integration Docs ↗
          </Link>
        </Button>
      </div>
    </Card>
  );
}
