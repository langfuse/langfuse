import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";
import Page from "@/src/components/layouts/page";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { api } from "@/src/utils/api";
import { DatasetsOnboarding } from "@/src/components/onboarding/DatasetsOnboarding";

export default function Datasets() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { t } = useTranslation("common");

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
        title: t("navigation.datasets"),
        help: {
          description: t("datasets.pageDescription", {
            defaultValue:
              "Datasets in Langfuse are a collection of inputs (and expected outputs) of an LLM application. They are used to benchmark new releases before deployment to production. See docs to learn more.",
          }),
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

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? "en", ["common"])),
  },
});
