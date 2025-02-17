import { TableWithMetadataWrapper } from "@/src/components/table/TableWithMetadataWrapper";
import { Button } from "@/src/components/ui/button";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DatasetRunItemsTable } from "@/src/features/datasets/components/DatasetRunItemsTable";
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

export default function Dataset() {
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

  return (
    <Page
      headerProps={{
        title: run.data?.name ?? runId,
        itemType: "DATASET_RUN",
        breadcrumb: [
          { name: "Datasets", href: `/project/${projectId}/datasets` },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
          { name: "Runs", href: `/project/${projectId}/datasets/${datasetId}` },
        ],
        actionButtonsRight: [
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
                    redirectUrl={`/project/${projectId}/datasets/${datasetId}`}
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>,
        ],
      }}
    >
      {run.data?.description || run.data?.metadata ? (
        <TableWithMetadataWrapper
          tableComponent={
            <DatasetRunItemsTable
              projectId={projectId}
              datasetId={datasetId}
              datasetRunId={runId}
            />
          }
          cardTitleChildren={
            <span className="text-lg font-medium">Run details</span>
          }
          cardContentChildren={
            <div className="grid h-full grid-cols-1 gap-2 overflow-hidden">
              {!!run.data?.description && (
                <JSONView
                  json={run.data.description}
                  title="Description"
                  className="overflow-y-auto"
                />
              )}
              {!!run.data?.metadata && (
                <JSONView
                  json={run.data.metadata}
                  title="Metadata"
                  className="overflow-y-auto"
                />
              )}
            </div>
          }
        />
      ) : (
        <DatasetRunItemsTable
          projectId={projectId}
          datasetId={datasetId}
          datasetRunId={runId}
        />
      )}
    </Page>
  );
}
