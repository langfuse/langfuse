import { api } from "@/src/utils/api";
import { AnnotationQueueItemsTable } from "@/src/features/annotation-queues/components/AnnotationQueueItemsTable";
import { Button } from "@/src/components/ui/button";
import { ClipboardPen, Lock } from "lucide-react";
import Link from "next/link";
import { CreateOrEditAnnotationQueueButton } from "@/src/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { Skeleton } from "@/src/components/ui/skeleton";
import Page from "@/src/components/layouts/page";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import { AnnotationQueueDetails } from "@/src/features/annotation-queues/components/AnnotationQueueDetails";

export default function QueueItems({
  projectId,
  queueId,
}: {
  projectId: string;
  queueId: string;
}) {
  const queue = api.annotationQueues.byId.useQuery(
    {
      queueId,
      projectId,
    },
    { enabled: Boolean(projectId) && Boolean(queueId) },
  );

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });

  if (!hasReadAccess) return <SupportOrUpgradePage />;

  return (
    <Page
      headerProps={{
        title: `${queue.data?.name}: ${queueId}`,
        itemType: "ANNOTATION_QUEUE",
        breadcrumb: [
          {
            name: "Annotation Queues",
            href: `/project/${projectId}/annotation-queues`,
          },
        ],
        actionButtonsRight: !hasWriteAccess ? (
          <Button disabled>
            <Lock className="mr-1 h-4 w-4" />
            <span className="text-sm">Process queue</span>
          </Button>
        ) : (
          <Button asChild>
            <Link
              href={`/project/${projectId}/annotation-queues/${queueId}/items`}
            >
              <ClipboardPen className="mr-1 h-4 w-4" />
              <span className="text-sm">Process queue</span>
            </Link>
          </Button>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-[1fr_auto] overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <AnnotationQueueItemsTable projectId={projectId} queueId={queueId} />
        </div>
        <SidePanel mobileTitle="Queue details" id="queue-details">
          <SidePanelHeader>
            <SidePanelTitle>Details</SidePanelTitle>
            <CreateOrEditAnnotationQueueButton
              projectId={projectId}
              queueId={queueId}
              variant="ghost"
              size="sm"
            />
          </SidePanelHeader>
          <SidePanelContent>
            <div className="w-full min-w-0">
              <div className="flex justify-end px-4 md:hidden">
                <CreateOrEditAnnotationQueueButton
                  projectId={projectId}
                  queueId={queueId}
                  variant="ghost"
                  size="sm"
                />
              </div>
              {queue.isLoading ? (
                <div className="p-4">
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <AnnotationQueueDetails
                  description={queue.data?.description ?? null}
                  scoreConfigs={queue.data?.scoreConfigs ?? []}
                />
              )}
            </div>
          </SidePanelContent>
        </SidePanel>
      </div>
    </Page>
  );
}
