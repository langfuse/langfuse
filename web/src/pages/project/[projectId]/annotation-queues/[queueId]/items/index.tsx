import { AnnotationQueuesItem } from "@/src/features/annotation-queues/components/AnnotationQueuesItem";
import { useRouter } from "next/router";

export default function AnnotationQueues() {
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
