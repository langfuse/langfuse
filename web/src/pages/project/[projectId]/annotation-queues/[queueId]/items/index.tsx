import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";

export default function AnnotationQueueItemsRedirect() {
  const router = useRouter();
  const annotationQueueId = router.query.queueId as string;
  const projectId = router.query.projectId as string;
  const showCompleted = router.query.showCompleted === "true";

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:read",
  });

  // Fetch list of item IDs to redirect to first one
  const itemIds = api.annotationQueueItems.itemIdsByQueueId.useQuery(
    {
      queueId: annotationQueueId,
      projectId,
      includeCompleted: showCompleted,
    },
    {
      enabled: !!annotationQueueId && !!projectId && hasReadAccess,
      refetchOnWindowFocus: false,
    },
  );

  // Redirect to first item when data is loaded
  useEffect(() => {
    if (itemIds.data && itemIds.data.length > 0) {
      const query: Record<string, string> = {};
      if (showCompleted) {
        query.showCompleted = "true";
      }

      router.replace({
        pathname: `/project/${projectId}/annotation-queues/${annotationQueueId}/items/${itemIds.data[0]}`,
        query,
      });
    }
  }, [itemIds.data, projectId, annotationQueueId, showCompleted, router]);

  if (!hasReadAccess) {
    return <SupportOrUpgradePage />;
  }

  // Show no items message if list is empty
  if (itemIds.data && itemIds.data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">No items in queue</p>
          <p className="text-sm text-muted-foreground">
            {showCompleted
              ? "This queue has no items."
              : "This queue has no pending items. Toggle 'Show completed' to see all items."}
          </p>
        </div>
      </div>
    );
  }

  // Show loading while fetching
  return <Skeleton className="h-full w-full" />;
}
