import { useRouter } from "next/router";
import { DatasetsTable } from "@/src/datasets/components/DatasetsTable";
import Page from "@/src/app/shell/layouts/page";
import { ButtonWithIcon } from "@/src/app/components/ButtonWithIcon";
import { DialogTrigger } from "@/src/app/design-system/legacy-primitives/dialog";
import { CreateDatasetDialogController } from "@/src/datasets/components/CreateDatasetDialogController";
import { api } from "@/src/app/utils/api";
import { DatasetsOnboarding } from "@/src/app/onboarding/shared-components/DatasetsOnboarding";
import { LockIcon, PlusIcon } from "lucide-react";
import { useQueryParam, StringParam } from "use-query-params";

export default function DatasetsPage() {
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
          title: "Datasets",
          help: {
            description:
              "Datasets in Langfuse are a collection of inputs (and expected outputs) of an LLM application. They are used to benchmark new releases before deployment to production. See docs to learn more.",
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
        title: "Datasets",
        help: {
          description:
            "Datasets in Langfuse are a collection of inputs (and expected outputs) of an LLM application. They are used to benchmark new releases before deployment to production. See docs to learn more.",
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
                  text="New dataset"
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
