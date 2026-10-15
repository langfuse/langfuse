/* eslint-disable no-nested-ternary */
import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations";
import Link from "next/link";
import { useRouter } from "next/router";
import { BlobStorageIntegrationContainer } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationContainer";
import { useBlobStorageIntegration } from "@/src/features/blobstorage-integration/useBlobStorageIntegration";
import { BlobStorageStatusSection } from "@/src/features/blobstorage-integration/components/BlobStorageStatusSection";

export default function BlobStorageIntegrationPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const {
    hasAccess,
    hasEntitlement,
    query: state,
    status,
  } = useBlobStorageIntegration(projectId);

  return (
    <ContainerPage
      headerProps={{
        title: "Blob Storage Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: status && <StatusBadge type={status} />,
        actionButtonsRight: (
          <Button asChild variant="secondary">
            <Link
              href="https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage"
              target="_blank"
            >
              Integration Docs ↗
            </Link>
          </Button>
        ),
      }}
    >
      <p className="text-primary mb-4 text-sm">
        Configure scheduled exports of your trace data to Amazon S3,
        S3-compatible storages, Azure Blob Storage, or Google Cloud Storage. Set
        up a hourly, daily, or weekly export to your own storage for data
        analysis or backup purposes. Use the &quot;Validate&quot; button to test
        your configuration by uploading a small test file, and the &quot;Run
        Now&quot; button to trigger an immediate export.
      </p>
      {!hasEntitlement ? (
        <p className="text-sm">
          This feature is not available in your current plan.
        </p>
      ) : !hasAccess ? (
        <p className="text-sm">
          Your current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      ) : (
        <>
          {state.data?.config && (
            <BlobStorageStatusSection config={state.data.config} />
          )}
          <Header title="Configuration" className="mt-8" />
          <Card className="p-3">
            {!state.data ? (
              <IntegrationSettingsSkeleton />
            ) : (
              <BlobStorageIntegrationContainer
                config={state.data.config ?? null}
                projectId={projectId}
                writeMode={state.data.writeMode}
              />
            )}
          </Card>
        </>
      )}
    </ContainerPage>
  );
}
