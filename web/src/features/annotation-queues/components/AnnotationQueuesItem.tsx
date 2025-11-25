import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import useSessionStorage from "@/src/components/useSessionStorage";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotationQueueItemPage } from "@/src/features/annotation-queues/components/AnnotationQueueItemPage";
import { api } from "@/src/utils/api";
import { AnnotationQueueObjectType } from "@langfuse/shared";
import { Goal, Network } from "lucide-react";
import Page from "@/src/components/layouts/page";

export const AnnotationQueuesItem = ({
  annotationQueueId,
  projectId,
  itemId,
}: {
  annotationQueueId: string;
  projectId: string;
  itemId?: string;
}) => {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:read",
  });

  const queue = api.annotationQueues.byId.useQuery(
    {
      queueId: annotationQueueId,
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );

  const currentItemType = api.annotationQueueItems.typeById.useQuery(
    {
      projectId,
      itemId: itemId as string,
      queueId: annotationQueueId,
    },
    { enabled: !!itemId },
  );

  const [view, setView] = useSessionStorage<"hideTree" | "showTree">(
    `annotationQueueView-${projectId}`,
    "hideTree",
  );

  const isSessionItem =
    !!currentItemType.data &&
    currentItemType.data === AnnotationQueueObjectType.SESSION;
  const isDetailedViewDisabled = isSessionItem;

  if (!hasAccess) return <SupportOrUpgradePage />;

  return (
    <Page
      withPadding
      headerProps={{
        title: itemId
          ? `${queue.data?.name}: ${itemId}`
          : (queue.data?.name ?? annotationQueueId),
        itemType: "QUEUE_ITEM",
        breadcrumb: [
          {
            name: "Annotation Queues",
            href: `/project/${projectId}/annotation-queues`,
          },
          {
            name: queue.data?.name ?? annotationQueueId,
            href: `/project/${projectId}/annotation-queues/${annotationQueueId}`,
          },
        ],
        actionButtonsRight: (
          <TooltipProvider>
            <Tabs
              value={isDetailedViewDisabled ? "hideTree" : view}
              onValueChange={(view: string) => {
                if (!isDetailedViewDisabled) {
                  setView(view as "hideTree" | "showTree");
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="hideTree">
                  <Goal className="mr-1 h-4 w-4"></Goal>
                  Focused
                </TabsTrigger>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <TabsTrigger
                        value="showTree"
                        disabled={isDetailedViewDisabled}
                        className={
                          isDetailedViewDisabled
                            ? "cursor-not-allowed opacity-50"
                            : ""
                        }
                      >
                        <Network className="mr-1 h-4 w-4"></Network>
                        Detailed
                      </TabsTrigger>
                    </span>
                  </TooltipTrigger>
                  {isDetailedViewDisabled && (
                    <TooltipContent>
                      <p>
                        Detailed view is only available for traces and
                        observations
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TabsList>
            </Tabs>
          </TooltipProvider>
        ),
      }}
    >
      <AnnotationQueueItemPage
        projectId={projectId}
        annotationQueueId={annotationQueueId}
        view={view}
        queryItemId={itemId}
      />
    </Page>
  );
};
