import { useRouter } from "next/router";
import { AnnotationQueuesTable } from "@/src/ee/features/annotation-queues/components/AnnotationQueuesTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import PageContainer from "@/src/components/layouts/page-container";

export default function AnnotationQueues() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:read",
  });
  const hasEntitlement = useHasEntitlement("annotation-queues");
  if (!hasAccess || !hasEntitlement) return <SupportOrUpgradePage />;

  return (
    <PageContainer
      headerProps={{
        title: "Annotation Queues",
        help: {
          description:
            "Annotation queues are used to manage scoring workflows for your LLM projects. See docs to learn more.",
          href: "https://langfuse.com/docs/scores/annotation",
        },
      }}
    >
      <AnnotationQueuesTable projectId={projectId} />
    </PageContainer>
  );
}
