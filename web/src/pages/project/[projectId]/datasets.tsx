import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";
import Page from "@/src/components/layouts/page";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { api } from "@/src/utils/api";
import { DatasetsOnboarding } from "@/src/components/onboarding/DatasetsOnboarding";

export default function Datasets() {
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
        title: "Datasets",
        help: {
          description:
            "Datasets in Langfuse are a collection of inputs (and expected outputs) of an LLM application. They are used to benchmark new releases before deployment to production. See docs to learn more.",
          href: "https://langfuse.com/docs/datasets",
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
