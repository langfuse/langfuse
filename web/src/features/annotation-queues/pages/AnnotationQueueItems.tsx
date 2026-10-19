/* eslint-disable @repo/component-file-structure */
import { api } from "@/src/utils/api";
import { useState } from "react";
import { AnnotationQueueItemsTable } from "@/src/features/annotation-queues/components/AnnotationQueueItemsTable";
import { Button } from "@/src/components/design-system/Button/Button";
import { ClipboardPen, Lock } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac";
import { SupportOrUpgradePage } from "@/src/ee/features/billing";
import Page from "@/src/components/layouts/page";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
} from "@/src/components/ui/side-panel";
import { AnnotationQueueSetupController } from "@/src/features/annotation-queues/components/AnnotationQueueSetupController";

export default function QueueItems({
  projectId,
  queueId,
}: {
  projectId: string;
  queueId: string;
}) {
  const [mobileSetupOpen, setMobileSetupOpen] = useState(false);
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
        <AnnotationQueueSetupController
          key={`${projectId}:${queueId}`}
          projectId={projectId}
          queueId={queueId}
          renderLayout={(content) => (
            <SidePanel
              mobileTitle="Queue setup"
              id="queue-details"
              scrollable={false}
              variant="sidebar"
              mobileOpenState={{
                open: mobileSetupOpen,
                onOpenChange: setMobileSetupOpen,
              }}
            >
              <SidePanelHeader>
                <span className="text-sm font-bold">Queue setup</span>
              </SidePanelHeader>
              <SidePanelContent className="isolate min-h-0 flex-1 gap-0">
                {content}
              </SidePanelContent>
            </SidePanel>
          )}
        />
      </div>
    </Page>
  );
}
