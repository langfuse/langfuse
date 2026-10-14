import { useRouter } from "next/router";
import { AnnotationQueuesTable } from "@/src/annotation/queues/components/AnnotationQueuesTable";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { SupportOrUpgradePage } from "@/src/ee/billing";
import Page from "@/src/app/shell/layouts/page";
import { AnnotationQueuesOnboarding } from "@/src/app/onboarding/shared-components/AnnotationQueuesOnboarding";
import { api } from "@/src/app/utils/api";
import { CreateOrEditAnnotationQueueButton } from "@/src/annotation/queues/components/CreateOrEditAnnotationQueueButton";

export default function AnnotationQueues() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:read",
  });

  // Check if the user has any annotation queues
  const { data: hasAnyQueue, isLoading } = api.annotationQueues.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchInterval: 10_000,
    },
  );

  const showOnboarding = !isLoading && !hasAnyQueue;

  if (!hasAccess) return <SupportOrUpgradePage />;

  return (
    <Page
      headerProps={{
        title: "Annotation Queues",
        help: {
          description:
            "Annotation queues are used to manage scoring workflows for your LLM projects. See docs to learn more.",
          href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues",
        },
        actionButtonsRight: (
          <CreateOrEditAnnotationQueueButton
            projectId={projectId}
            variant="default"
          />
        ),
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no annotation queues */}
      {showOnboarding ? (
        <AnnotationQueuesOnboarding projectId={projectId} />
      ) : (
        <AnnotationQueuesTable projectId={projectId} />
      )}
    </Page>
  );
}
