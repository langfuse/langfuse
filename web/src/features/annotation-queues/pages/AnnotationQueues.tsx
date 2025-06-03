import { useRouter } from "next/router";
import { AnnotationQueuesTable } from "@/src/features/annotation-queues/components/AnnotationQueuesTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import Page from "@/src/components/layouts/page";
import { AnnotationQueuesOnboarding } from "@/src/components/onboarding/AnnotationQueuesOnboarding";
import { api } from "@/src/utils/api";
import { CreateOrEditAnnotationQueueButton } from "@/src/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";

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
          href: "https://langfuse.com/docs/scores/annotation",
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
