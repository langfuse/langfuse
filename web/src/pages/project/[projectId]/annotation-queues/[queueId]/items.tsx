import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { AnnotationQueueItemPage } from "@/src/features/scores/components/AnnotationQueueItemPage";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export default function AnnotationQueues() {
  const router = useRouter();
  const annotationQueueId = router.query.queueId as string;
  const projectId = router.query.projectId as string;

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

  return (
    <FullScreenPage>
      <Header
        title={`${queue.data?.name ?? annotationQueueId}`}
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
    </FullScreenPage>
  );
}
