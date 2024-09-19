import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { AnnotationQueuesTable } from "@/src/features/scores/components/AnnotationQueuesTable";

export default function AnnotationQueues() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <FullScreenPage>
      <Header
        title="Annotation Queues"
        help={{
          description:
            "Annotation queues are used to manage scoring workflows for your LLM projects. See docs to learn more.",
          href: "https://langfuse.com/docs/scores/annotation",
        }}
      />
      <AnnotationQueuesTable projectId={projectId} />
    </FullScreenPage>
  );
}
