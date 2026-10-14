import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { JSONView } from "@/src/app/design-system/legacy-primitives/CodeJsonViewer";
import { DatasetRunItemsByRunTable } from "@/src/datasets/components/DatasetRunItemsByRunTable";
import { DeleteDatasetRunDialogController } from "@/src/datasets/components/DeleteDatasetRunDialogController";
import { DetailPageNav } from "@/src/app/shell/navigate-detail-pages";
import { api } from "@/src/app/utils/api";
import { Columns3, MoreVertical, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Page from "@/src/app/shell/layouts/page";
import { DropdownMenu } from "@/src/app/design-system/DropdownMenu/DropdownMenu";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/app/design-system/legacy-primitives/side-panel";
import { Skeleton } from "@/src/app/design-system/legacy-primitives/skeleton";
import { getDatasetBreadcrumb } from "@/src/datasets/utils/getDatasetBreadcrumb";
import {
  useExperimentAccess,
  singleRunToExperimentsUrl,
} from "@/src/experiments";
import { buildLocalIsoDatePresentation } from "@/src/app/utils/dates";

function DatasetRunLegacy() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const runId = router.query.runId as string;

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });
  const run = api.datasets.runById.useQuery({
    datasetId,
    projectId,
    runId,
  });
  const breadcrumb = getDatasetBreadcrumb(
    projectId,
    datasetId,
    dataset.data?.name,
  );

  const preparedDate = buildLocalIsoDatePresentation({
    date: run.data?.datasetVersion,
  });

  return (
    <Page
      headerProps={{
        title: run.data?.name ?? runId,
        itemType: "EXPERIMENT",
        breadcrumb: [
          ...breadcrumb,
          {
            name: "Experiments",
            href: `/project/${projectId}/datasets/${datasetId}/experiments`,
          },
        ],
        actionButtonsRight: (
          <>
            <Link
              href={{
                pathname: `/project/${projectId}/datasets/${datasetId}/compare`,
                query: { runs: [runId] },
              }}
            >
              <Button>
                <Columns3 className="icon-base text-icon-foreground mr-2" />
                <span>Compare</span>
              </Button>
            </Link>
            <DetailPageNav
              currentId={runId}
              path={(entry) =>
                `/project/${projectId}/datasets/${datasetId}/runs/${entry.id}`
              }
              listKey="datasetRuns"
            />
            <DeleteDatasetRunDialogController
              projectId={projectId}
              datasetRunId={runId}
              datasetId={datasetId}
              redirectUrl={`/project/${projectId}/datasets/${datasetId}/experiments`}
            >
              {({ disabled, openDialog }) => (
                <DropdownMenu
                  items={[
                    {
                      type: "item",
                      id: "delete",
                      title: "Delete",
                      icon: Trash,
                      disabled: disabled
                        ? { reason: "Missing permission to delete this run" }
                        : undefined,
                      onClick: openDialog,
                    },
                  ]}
                >
                  {({ getTriggerProps }) => (
                    <Button
                      variant="outline"
                      size="icon"
                      {...getTriggerProps()}
                    >
                      <MoreVertical className="icon-base text-icon-foreground" />
                    </Button>
                  )}
                </DropdownMenu>
              )}
            </DeleteDatasetRunDialogController>
          </>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-[1fr_auto] overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <DatasetRunItemsByRunTable
            projectId={projectId}
            datasetId={datasetId}
            datasetRunId={runId}
            datasetVersion={run.data?.datasetVersion}
          />
        </div>
        <SidePanel
          mobileTitle="Experiment run details"
          id="experiment-run-details"
        >
          <SidePanelHeader>
            <SidePanelTitle>Experiment run details</SidePanelTitle>
          </SidePanelHeader>
          <SidePanelContent>
            {run.isPending ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <>
                {run.data?.datasetVersion && preparedDate && (
                  <div className="flex flex-col gap-2 p-1">
                    <span className="text-sm font-bold">Dataset Version</span>
                    <Link
                      href={`/project/${projectId}/datasets/${datasetId}/items?version=${run.data.datasetVersion.toISOString()}`}
                      className="text-link hover:text-link-hover text-sm"
                    >
                      <span title={preparedDate.title}>
                        {preparedDate.display}
                      </span>
                    </Link>
                  </div>
                )}
                {!!run.data?.description && (
                  <JSONView
                    json={run.data.description}
                    title="Description"
                    className="w-full overflow-y-auto"
                  />
                )}
                {!!run.data?.metadata && (
                  <JSONView
                    json={run.data.metadata}
                    title="Metadata"
                    className="w-full overflow-y-auto"
                  />
                )}
                {!run.data?.description && !run.data?.metadata && (
                  <div className="text-muted-foreground mt-1 px-1 text-sm">
                    No description or metadata for this run
                  </div>
                )}
              </>
            )}
          </SidePanelContent>
        </SidePanel>
      </div>
    </Page>
  );
}

export default function DatasetRunPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const runId = router.query.runId as string;
  const { isExperimentsBetaActive, isInitializing } = useExperimentAccess();

  useEffect(() => {
    if (
      !router.isReady ||
      isInitializing ||
      !isExperimentsBetaActive ||
      !projectId ||
      !runId
    ) {
      return;
    }

    router.replace(singleRunToExperimentsUrl(projectId, runId));
  }, [isExperimentsBetaActive, isInitializing, projectId, router, runId]);

  if (!router.isReady || isInitializing || isExperimentsBetaActive) {
    return <Skeleton className="h-full w-full" />;
  }

  return <DatasetRunLegacy />;
}
