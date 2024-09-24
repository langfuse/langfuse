import Header from "@/src/components/layouts/header";
import { AnnotationQueueItemPage } from "@/src/features/scores/components/AnnotationQueueItemPage";
import { useRouter } from "next/router";

export default function AnnotationQueues() {
  const router = useRouter();
  const annotationQueueId = router.query.queueId as string;
  const projectId = router.query.projectId as string;

  return (
    <>
      <Header
        title={`Annotation Queue ${annotationQueueId}`} // TODO: get name from API
        breadcrumb={[
          {
            name: "Annotation Queues",
            href: `/project/${projectId}/annotation-queues`,
          },
          { name: annotationQueueId },
        ]}
      />
      <AnnotationQueueItemPage
        projectId={projectId}
        annotationQueueId={annotationQueueId}
      />
    </>
  );
}
