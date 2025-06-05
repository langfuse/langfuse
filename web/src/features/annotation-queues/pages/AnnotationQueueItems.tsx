import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { AnnotationQueueItemsTable } from "@/src/features/annotation-queues/components/AnnotationQueueItemsTable";
import { CardDescription } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { ClipboardPen, Lock } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import Link from "next/link";
import { CreateOrEditAnnotationQueueButton } from "@/src/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { Skeleton } from "@/src/components/ui/skeleton";
import Page from "@/src/components/layouts/page";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import { SubHeaderLabel } from "@/src/components/layouts/header";

export default function QueueItems() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const queueId = router.query.queueId as string;

  const queue = api.annotationQueues.byId.useQuery({
    queueId,
    projectId,
  });

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
      <div className="grid flex-1 grid-cols-[1fr,auto] overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <AnnotationQueueItemsTable projectId={projectId} queueId={queueId} />
        </div>
        <SidePanel
          mobileTitle={queue.data?.name ?? "Queue details"}
          id="queue-details"
        >
          <SidePanelHeader>
            <SidePanelTitle>
              {queue.data?.name ?? "Queue details"}
            </SidePanelTitle>
            <CreateOrEditAnnotationQueueButton
              projectId={projectId}
              queueId={queueId}
            />
          </SidePanelHeader>
          <SidePanelContent>
            {queue.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <>
                {queue.data?.description && (
                  <CardDescription className="text-sm">
                    {queue.data?.description}
                  </CardDescription>
                )}
                <div className="flex flex-col gap-2">
                  <SubHeaderLabel title="Score Configs" />
                  <div className="flex flex-wrap gap-2">
                    {queue.data?.scoreConfigs.map((scoreConfig) => (
                      <Badge key={scoreConfig.id} variant="outline">
                        {getScoreDataTypeIcon(scoreConfig.dataType)}
                        <span className="ml-0.5">{scoreConfig.name}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </SidePanelContent>
        </SidePanel>
      </div>
    </Page>
  );
}
