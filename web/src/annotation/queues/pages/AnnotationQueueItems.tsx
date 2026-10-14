import { api } from "@/src/app/utils/api";
import { AnnotationQueueItemsTable } from "@/src/annotation/queues/components/AnnotationQueueItemsTable";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { ClipboardPen, Lock } from "lucide-react";
import Link from "next/link";
import { CreateOrEditAnnotationQueueButton } from "@/src/annotation/queues/components/CreateOrEditAnnotationQueueButton";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { SupportOrUpgradePage } from "@/src/ee/billing";
import { Skeleton } from "@/src/app/design-system/legacy-primitives/skeleton";
import Page from "@/src/app/shell/layouts/page";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/app/design-system/legacy-primitives/side-panel";
import { AnnotationQueueDetails } from "@/src/annotation/queues/components/AnnotationQueueDetails";

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
            <Lock className="icon-base text-icon-foreground mr-1" />
            <span className="text-sm">Process queue</span>
          </Button>
        ) : (
          <Button asChild>
            <Link
              href={`/project/${projectId}/annotation-queues/${queueId}/items`}
            >
              <ClipboardPen className="icon-base text-icon-foreground mr-1" />
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
