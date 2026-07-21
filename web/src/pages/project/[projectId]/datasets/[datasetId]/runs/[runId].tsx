import { Button } from "@/src/components/ui/button";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DatasetRunItemsByRunTable } from "@/src/features/datasets/components/DatasetRunItemsByRunTable";
import { DeleteDatasetRunButton } from "@/src/features/datasets/components/DeleteDatasetRunButton";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { api } from "@/src/utils/api";
import { Columns3, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import { Skeleton } from "@/src/components/ui/skeleton";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { getDatasetBreadcrumb } from "@/src/features/datasets/utils/getDatasetBreadcrumb";
import { ExperimentItemsTable } from "@/src/features/experiments/components/table";
import { useExperimentAccess } from "@/src/features/experiments/hooks/useExperimentAccess";

export default function Dataset() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const runId = router.query.runId as string;

  // Fast-preview (v4) users read experiment items directly from the events
  // table; legacy users keep the dataset_run_items read path. Note that
  // experiment_id === dataset_run_id, so the route's runId is the experiment id.
  const { isExperimentsBetaActive } = useExperimentAccess();

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });
  const run = api.datasets.runById.useQuery(
    {
      datasetId,
      projectId,
      runId,
    },
    {
      enabled: !isExperimentsBetaActive,
    },
  );
  // In fast-preview mode a direct-written experiment may not have a Postgres
  // dataset-run row, so source the title/name from the events-backed experiment.
  const experiment = api.experiments.byId.useQuery(
    {
      projectId,
      experimentId: runId,
    },
    {
      enabled: isExperimentsBetaActive && Boolean(runId),
    },
  );
  const details = isExperimentsBetaActive ? experiment.data : run.data;
  const isDetailsPending = isExperimentsBetaActive
    ? experiment.isPending
    : run.isPending;
  const breadcrumb = getDatasetBreadcrumb(
    projectId,
    datasetId,
    dataset.data?.name,
  );

  return (
    <Page
      headerProps={{
        title: isExperimentsBetaActive
          ? (experiment.data?.name ?? run.data?.name ?? runId)
          : (run.data?.name ?? runId),
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
                <Columns3 className="mr-2 h-4 w-4" />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild>
                  <DeleteDatasetRunButton
                    projectId={projectId}
                    datasetRunId={runId}
                    datasetId={datasetId}
                    redirectUrl={`/project/${projectId}/datasets/${datasetId}/experiments`}
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-[1fr_auto] overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          {isExperimentsBetaActive ? (
            <ExperimentItemsTable projectId={projectId} experimentId={runId} />
          ) : (
            <DatasetRunItemsByRunTable
              projectId={projectId}
              datasetId={datasetId}
              datasetRunId={runId}
              datasetVersion={run.data?.datasetVersion}
            />
          )}
        </div>
        <SidePanel
          mobileTitle="Experiment run details"
          id="experiment-run-details"
        >
          <SidePanelHeader>
            <SidePanelTitle>Experiment run details</SidePanelTitle>
          </SidePanelHeader>
          <SidePanelContent>
            {isDetailsPending ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <>
                {run.data?.datasetVersion && (
                  <div className="flex flex-col gap-2 p-1">
                    <span className="text-sm font-medium">Dataset Version</span>
                    <Link
                      href={`/project/${projectId}/datasets/${datasetId}/items?version=${run.data.datasetVersion.toISOString()}`}
                      className="text-link hover:text-link-hover text-sm"
                    >
                      <LocalIsoDate date={run.data.datasetVersion} />
                    </Link>
                  </div>
                )}
                {!!details?.description && (
                  <JSONView
                    json={details.description}
                    title="Description"
                    className="w-full overflow-y-auto"
                  />
                )}
                {!!details?.metadata && (
                  <JSONView
                    json={details.metadata}
                    title="Metadata"
                    className="w-full overflow-y-auto"
                  />
                )}
                {!details?.description && !details?.metadata && (
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
