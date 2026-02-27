import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { Button } from "@/src/components/ui/button";
import {
  Columns3,
  MoreVertical,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DeleteDatasetRunButton } from "@/src/features/datasets/components/DeleteDatasetRunButton";
import { ExperimentItemsTable } from "@/src/features/experiments/components/table";
import { ExperimentOverviewPanel } from "@/src/features/experiments/components/ExperimentOverviewPanel";
import { ResizableDesktopLayout } from "@/src/components/layouts/ResizableDesktopLayout";
import { useMediaQuery } from "react-responsive";
import { useState } from "react";

export default function ExperimentDetail() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const experimentId = router.query.experimentId as string;
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(true);

  // Fetch experiment to get dataset ID and other details
  const { data: experiment } = api.experiments.byId.useQuery(
    {
      projectId,
      experimentId,
    },
    {
      enabled: Boolean(projectId && experimentId),
    },
  );

  // Fetch dataset name for breadcrumb
  const { data: dataset } = api.datasets.byId.useQuery(
    {
      projectId,
      datasetId: experiment?.datasetId ?? "",
    },
    {
      enabled: Boolean(experiment?.datasetId),
    },
  );

  return (
    <Page
      headerProps={{
        title: experiment?.name ?? experimentId,
        itemType: "DATASET_RUN",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
          ...(experiment?.datasetId
            ? [
                {
                  name: dataset?.name ?? experiment.datasetId,
                  href: `/project/${projectId}/datasets/${experiment.datasetId}`,
                },
              ]
            : []),
        ],
        help: {
          description:
            "View and analyze experiment items with traces, scores, and metrics.",
          href: "https://langfuse.com/docs/datasets/experiments",
        },
        actionButtonsRight: experiment?.datasetId ? (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsDetailsPanelOpen(!isDetailsPanelOpen)}
              title={isDetailsPanelOpen ? "Hide details" : "Show details"}
            >
              {isDetailsPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
            <Link
              href={{
                pathname: `/project/${projectId}/datasets/${experiment.datasetId}/compare`,
                query: { runs: [experimentId] },
              }}
            >
              <Button>
                <Columns3 className="mr-2 h-4 w-4" />
                <span>Compare</span>
              </Button>
            </Link>
            <DetailPageNav
              currentId={experimentId}
              path={(entry) => `/project/${projectId}/experiments/${entry.id}`}
              listKey="experiments"
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
                    datasetRunId={experimentId}
                    datasetId={experiment.datasetId}
                    redirectUrl={`/project/${projectId}/datasets/${experiment.datasetId}`}
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : undefined,
      }}
    >
      {experiment?.datasetId ? (
        isDesktop ? (
          <ResizableDesktopLayout
            mainContent={
              <ExperimentItemsTable
                projectId={projectId}
                experimentId={experimentId}
                datasetId={experiment.datasetId}
              />
            }
            sidebarContent={
              <div className="flex h-full flex-col overflow-y-auto p-4">
                <ExperimentOverviewPanel
                  projectId={projectId}
                  experiment={experiment}
                />
              </div>
            }
            open={isDetailsPanelOpen}
            defaultMainSize={75}
            defaultSidebarSize={25}
            minMainSize={50}
            maxSidebarSize={40}
            sidebarPosition="right"
            persistId={`experiment-detail-${experimentId}`}
          />
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            {isDetailsPanelOpen && (
              <div className="overflow-y-auto border-b p-4">
                <ExperimentOverviewPanel
                  projectId={projectId}
                  experiment={experiment}
                />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <ExperimentItemsTable
                projectId={projectId}
                experimentId={experimentId}
                datasetId={experiment.datasetId}
              />
            </div>
          </div>
        )
      ) : (
        <div className="p-4">Loading experiment...</div>
      )}
    </Page>
  );
}
