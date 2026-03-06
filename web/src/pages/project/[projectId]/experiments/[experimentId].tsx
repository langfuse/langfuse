import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { Button } from "@/src/components/ui/button";
import { Columns3, MoreVertical } from "lucide-react";
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
import {
  OverviewPanelLayout,
  OverviewPanelToggle,
} from "@/src/components/layouts/overview-panel";
import useSessionStorage from "@/src/components/useSessionStorage";

export default function ExperimentDetail() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const experimentId = router.query.experimentId as string;

  const [isOverviewOpen, setIsOverviewOpen] = useSessionStorage(
    "overview-panel-experiment-detail",
    true,
  );

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

  return (
    <Page
      headerProps={{
        title: experiment?.name ?? experimentId,
        itemType: "EXPERIMENT",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
        ],
        help: {
          description:
            "View and analyze experiment items with traces, scores, and metrics.",
          href: "https://langfuse.com/docs/datasets/experiments",
        },
        actionButtonsRight: experiment?.datasetId ? (
          <>
            <OverviewPanelToggle
              open={isOverviewOpen}
              onOpenChange={setIsOverviewOpen}
            />
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
        <OverviewPanelLayout
          open={isOverviewOpen}
          persistId={`experiment-detail-${experimentId}`}
          mainContent={
            <ExperimentItemsTable
              projectId={projectId}
              experimentId={experimentId}
              datasetId={experiment.datasetId}
            />
          }
          overviewContent={
            <ExperimentOverviewPanel
              projectId={projectId}
              experiment={experiment}
            />
          }
          defaultMainSize={75}
          defaultSidebarSize={25}
          minMainSize={50}
          maxSidebarSize={40}
        />
      ) : (
        <div className="p-4">Loading experiment...</div>
      )}
    </Page>
  );
}
