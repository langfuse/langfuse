import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import useSessionStorage from "@/src/components/useSessionStorage";
import { AnnotationQueueItemPage } from "@/src/features/scores/components/AnnotationQueueItemPage";
import { api } from "@/src/utils/api";
import { Network } from "lucide-react";
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

  const [view, setView] = useSessionStorage<"hideTree" | "showTree">(
    `annotationQueueView-${projectId}`,
    "hideTree",
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
        actionButtons={
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setView(view === "hideTree" ? "showTree" : "hideTree")
            }
            title={view === "hideTree" ? "Show trace tree" : "Hide trace tree"}
          >
            <Network className="h-4 w-4"></Network>
          </Button>
        }
      />
      <AnnotationQueueItemPage
        projectId={projectId}
        annotationQueueId={annotationQueueId}
        view={view}
      />
    </FullScreenPage>
  );
}
