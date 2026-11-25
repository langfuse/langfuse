import { useRouter } from "next/router";
import { AnnotationQueuesTable } from "@/src/features/annotation-queues/components/AnnotationQueuesTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import Page from "@/src/components/layouts/Page";
import { AnnotationQueuesOnboarding } from "@/src/components/onboarding/AnnotationQueuesOnboarding";
import { api } from "@/src/utils/api";
import { ActionButton } from "@/src/components/ActionButton";
import { PlusIcon } from "@langfuse/icons";
import { ConnectedAnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/ConnectedAnnotationQueueFormDialogController";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";

export default function AnnotationQueues() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:read",
  });
  const canCreateQueues = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const queueLimit = useEntitlementLimit("annotation-queue-count");
  const queueCount = api.annotationQueues.count.useQuery(
    { projectId },
    { enabled: !!projectId && canCreateQueues },
  );
  const usageLimit =
    typeof queueLimit === "number"
      ? { current: queueCount.data, max: queueLimit }
      : undefined;

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
    <ConnectedAnnotationQueueFormDialogController
      projectId={projectId}
      mode="create"
      onSuccess={() => undefined}
    >
      {({ disabled, openDialog }) => (
        <Page
          headerProps={{
            title: "Annotation Queues",
            help: {
              description:
                "Annotation queues are used to manage scoring workflows for your LLM projects. See docs to learn more.",
              href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues",
            },
            actionButtonsRight: (
              <ActionButton
                hasAccess={!disabled}
                usageLimit={usageLimit}
                onClick={openDialog}
                icon={<PlusIcon size="base" aria-hidden="true" />}
                variant="default"
              >
                <span className="ml-1 text-sm font-normal">New queue</span>
              </ActionButton>
            ),
          }}
          scrollable={showOnboarding}
        >
          {/* Show onboarding screen if user has no annotation queues */}
          {showOnboarding ? (
            <AnnotationQueuesOnboarding
              disabled={disabled}
              usageLimit={usageLimit}
              onClick={openDialog}
            />
          ) : (
            <AnnotationQueuesTable projectId={projectId} />
          )}
        </Page>
      )}
    </ConnectedAnnotationQueueFormDialogController>
  );
}
