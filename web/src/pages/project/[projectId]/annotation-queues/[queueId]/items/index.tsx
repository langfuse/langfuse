import { AnnotationQueuesItem } from "@/src/features/annotation-queues/components/AnnotationQueuesItem";
import { withRouterReady } from "@/src/components/with-router-ready";
import { useRouter } from "next/router";

function AnnotationQueues() {
  const router = useRouter();
  const annotationQueueId = router.query.queueId as string;
  const projectId = router.query.projectId as string;

  return (
    <AnnotationQueuesItem
      annotationQueueId={annotationQueueId}
      projectId={projectId}
    />
  );
}

export default withRouterReady(AnnotationQueues);
