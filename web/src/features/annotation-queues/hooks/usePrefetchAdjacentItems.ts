import { useEffect } from "react";
import { api } from "@/src/utils/api";

/**
 * Prefetches adjacent items (previous and next) in the queue for faster navigation
 */
export const usePrefetchAdjacentItems = ({
  projectId,
  itemIds,
  currentItemId,
  enabled = true,
}: {
  projectId: string;
  itemIds: string[] | undefined;
  currentItemId: string | undefined;
  enabled?: boolean;
}) => {
  const utils = api.useUtils();

  useEffect(() => {
    if (!enabled || !currentItemId || !itemIds || itemIds.length === 0) {
      return;
    }

    const currentIndex = itemIds.indexOf(currentItemId);
    if (currentIndex === -1) {
      return;
    }

    // Prefetch previous item
    if (currentIndex > 0) {
      const prevItemId = itemIds[currentIndex - 1];
      void utils.annotationQueueItems.byId.prefetch({
        projectId,
        itemId: prevItemId,
      });
    }

    // Prefetch next item
    if (currentIndex < itemIds.length - 1) {
      const nextItemId = itemIds[currentIndex + 1];
      void utils.annotationQueueItems.byId.prefetch({
        projectId,
        itemId: nextItemId,
      });
    }
  }, [currentItemId, itemIds, projectId, enabled, utils]);
};
