import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/features/datasets/components/DatasetsTable";
import Page from "@/src/components/layouts/page";
import { ButtonWithIcon } from "@/src/components/ButtonWithIcon";
import { DialogTrigger } from "@/src/components/ui/dialog";
import { CreateDatasetDialogController } from "@/src/features/datasets/components/CreateDatasetDialogController";
import { api } from "@/src/utils/api";
import { DatasetsOnboarding } from "@/src/components/onboarding/DatasetsOnboarding";
import { LockIcon, PlusIcon } from "lucide-react";
import { useQueryParam, StringParam } from "use-query-params";
import { useTranslations } from "next-intl";

export default function Datasets() {
  const t = useTranslations("coreDetails.datasets.page");
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [currentFolderPath] = useQueryParam("folder", StringParam);

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

  if (showOnboarding) {
    return (
      <Page
        headerProps={{
          title: t("datasets"),
          help: {
            description: t("description"),
            href: "https://langfuse.com/docs/evaluation/dataset-runs/datasets",
          },
        }}
        scrollable
      >
        <DatasetsOnboarding projectId={projectId} />
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: t("datasets"),
        help: {
          description: t("description"),
          href: "https://langfuse.com/docs/evaluation/dataset-runs/datasets",
        },
        actionButtonsRight: (
          <CreateDatasetDialogController
            projectId={projectId}
            target={
              currentFolderPath
                ? { type: "folder", prefix: currentFolderPath }
                : { type: "root" }
            }
          >
            {({ disabled, openDialog }) => (
              <DialogTrigger asChild>
                <ButtonWithIcon
                  size="default"
                  disabled={disabled !== undefined}
                  onClick={openDialog}
                  variant="default"
                  icon={disabled === undefined ? PlusIcon : LockIcon}
                  text={t("newDataset")}
                />
              </DialogTrigger>
            )}
          </CreateDatasetDialogController>
        ),
      }}
    >
      <DatasetsTable projectId={projectId} />
    </Page>
  );
}
