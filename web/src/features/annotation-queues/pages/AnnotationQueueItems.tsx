import { api } from "@/src/utils/api";
import { AnnotationQueueItemsTable } from "@/src/features/annotation-queues/components/AnnotationQueueItemsTable";
import { Button } from "@/src/components/design-system/Button/Button";
import { ClipboardPen, Lock, Pencil } from "lucide-react";
import { CreateOrEditAnnotationQueueButton } from "@/src/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";
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
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { AnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogController";
import { EditScoreConfigDialogController } from "@/src/features/score-configs";
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
      <div className="grid flex-1 grid-cols-[1fr_auto] overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <section
            className="flex flex-col gap-2 border-b p-4"
            aria-label="Queue score configs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">Score configs</h2>
              <AnnotationQueueFormDialogController
                projectId={projectId}
                mode="edit"
                queueId={queueId}
                onSuccess={() => undefined}
              >
                {({ disabled, openDialog }) => (
                  <Button
                    text="Add/Edit score configs"
                    size="sm"
                    variant="secondary"
                    disabled={!!disabled}
                    onClick={openDialog}
                  />
                )}
              </AnnotationQueueFormDialogController>
            </div>
            {queue.isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <EditScoreConfigDialogController projectId={projectId}>
                {({ disabled, openDialog }) => (
                  <ol
                    className="flex flex-wrap gap-2"
                    aria-label="Score config order"
                  >
                    {queue.data?.scoreConfigs.map((config, index) => (
                      <li
                        key={config.id}
                        className="bg-muted flex max-w-full items-center gap-2 rounded-md px-2 py-1"
                      >
                        <span className="text-muted-foreground text-xs">
                          {index + 1}.
                        </span>
                        <span className="min-w-0 text-sm wrap-anywhere">
                          {config.name}
                          {config.isArchived ? " (Archived)" : ""}
                        </span>
                        <IconButton
                          icon={Pencil}
                          label={`Edit score config ${config.name}`}
                          title={
                            disabled?.reason ?? "Edit project-wide score config"
                          }
                          size="sm"
                          disabled={!!disabled}
                          onClick={() =>
                            openDialog({
                              id: config.id,
                              name: config.name,
                              dataType: config.dataType,
                              description: config.description ?? undefined,
                              minValue: config.minValue ?? undefined,
                              maxValue: config.maxValue ?? undefined,
                              categories: config.categories ?? undefined,
                            })
                          }
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </EditScoreConfigDialogController>
            )}
            {queue.data?.scoreConfigs.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No score configs yet. Add a score config to set up this
                queue&apos;s annotation fields.
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Annotators see these fields in this order. Score config
              definitions are project-wide; editing one can affect other queues.
            </p>
          </section>
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
