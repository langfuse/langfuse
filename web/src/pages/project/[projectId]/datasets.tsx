import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";
import Page from "@/src/components/layouts/page";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { api } from "@/src/utils/api";
import { DatasetsOnboarding } from "@/src/components/onboarding/DatasetsOnboarding";
import { useTranslation } from "react-i18next";

export default function Datasets() {
  const { t } = useTranslation();
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Check if the project has any datasets
  const { data: hasAnyDataset, isLoading } = api.datasets.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const showOnboarding = !isLoading && !hasAnyDataset;

  return (
    <Page
      headerProps={{
        title: t("dataset.pages.title"),
        help: {
          description: t("dataset.pages.description"),
          href: "https://langfuse.com/docs/evaluation/dataset-runs/datasets",
        },
        actionButtonsRight: (
          <DatasetActionButton projectId={projectId} mode="create" />
        ),
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if project has no datasets */}
      {showOnboarding ? (
        <DatasetsOnboarding projectId={projectId} />
      ) : (
        <DatasetsTable projectId={projectId} />
      )}
    </Page>
  );
}
