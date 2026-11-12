import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";

export function annotationQueueItemListKey(queueId: string) {
  return `annotationQueueItems:${queueId}`;
}

export function AnnotationQueueItemNav({
  projectId,
  queueId,
  itemId,
}: {
  projectId: string;
  queueId: string;
  itemId: string;
}) {
  return (
    <DetailPageNav
      currentId={itemId}
      listKey={annotationQueueItemListKey(queueId)}
      compact
      path={(entry) =>
        `/project/${projectId}/annotation-queues/${queueId}/items/${entry.id}?singleItem=true`
      }
    />
  );
}
