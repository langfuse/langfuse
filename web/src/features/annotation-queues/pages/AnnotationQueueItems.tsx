import { SheetClose } from "@/src/components/ui/sheet";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { api } from "@/src/utils/api";
import { AnnotationQueueItemsTable } from "@/src/features/annotation-queues/components/AnnotationQueueItemsTable";
import { Button } from "@/src/components/design-system/Button/Button";
import { ClipboardPen, Lock, Settings2, type LucideIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac";
import { SupportOrUpgradePage } from "@/src/ee/features/billing";
import { Skeleton } from "@/src/components/ui/skeleton";
import Page from "@/src/components/layouts/page";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import { AnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogController";
import { AnnotationQueueScoreConfigsDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueScoreConfigsDialogController";
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
          <Button disabled icon={Lock} text="Process queue" />
        ) : (
          <Button
            href={`/project/${projectId}/annotation-queues/${queueId}/items`}
            icon={ClipboardPen}
            text="Process queue"
          />
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] overflow-hidden">
        <div className="flex h-full min-w-0 flex-col overflow-hidden">
          <AnnotationQueueItemsTable projectId={projectId} queueId={queueId} />
        </div>
        <AnnotationQueueFormDialogController
          projectId={projectId}
          mode="edit"
          queueId={queueId}
          onSuccess={() => undefined}
        >
          {(settings) => (
            <AnnotationQueueScoreConfigsDialogController
              projectId={projectId}
              queueId={queueId}
            >
              {(configs) => (
                <SidePanel
                  mobileTitle="Queue setup"
                  id="queue-details"
                  scrollable={false}
                >
                  <SidePanelHeader>
                    <SidePanelTitle>Queue setup</SidePanelTitle>
                  </SidePanelHeader>
                  <SidePanelContent className="min-h-0 flex-1 gap-0">
                    <div className="flex w-full shrink-0 justify-end border-b px-4 py-2">
                      <QueueSidebarAction
                        text="Queue settings"
                        icon={Settings2}
                        disabledReason={settings.disabled?.reason}
                        onClick={settings.openDialog}
                      />
                    </div>
                    {queue.isLoading ? (
                      <div className="w-full p-4">
                        <Skeleton className="h-40 w-full" />
                      </div>
                    ) : (
                      <AnnotationQueueDetails
                        description={queue.data?.description ?? null}
                        scoreConfigs={queue.data?.scoreConfigs ?? []}
                        editAction={
                          <QueueSidebarAction
                            text={
                              queue.data?.scoreConfigs.length
                                ? "Edit score configs"
                                : "Add score configs"
                            }
                            icon={undefined}
                            disabledReason={configs.disabled?.reason}
                            onClick={configs.openDialog}
                          />
                        }
                      />
                    )}
                  </SidePanelContent>
                </SidePanel>
              )}
            </AnnotationQueueScoreConfigsDialogController>
          )}
        </AnnotationQueueFormDialogController>
      </div>
    </Page>
  );
}

function QueueSidebarAction({
  text,
  icon,
  disabledReason,
  onClick,
}: {
  text: string;
  icon: LucideIcon | undefined;
  disabledReason: string | undefined;
  onClick: () => void;
}) {
  const isMobile = useIsMobile();
  const button = (
    <Button
      text={text}
      icon={icon}
      size="sm"
      variant="secondary"
      disabled={!!disabledReason}
      title={disabledReason}
      onClick={onClick}
    />
  );
  return isMobile ? <SheetClose asChild>{button}</SheetClose> : button;
}
