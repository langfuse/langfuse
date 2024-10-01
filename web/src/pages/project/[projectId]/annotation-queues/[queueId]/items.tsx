import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import useSessionStorage from "@/src/components/useSessionStorage";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import { FeatureFlagToggle } from "@/src/features/feature-flags/components/FeatureFlagToggle";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotationQueueItemPage } from "@/src/features/scores/components/AnnotationQueueItemPage";
import { api } from "@/src/utils/api";
import { Network } from "lucide-react";
import { useRouter } from "next/router";

export default function AnnotationQueues() {
  const router = useRouter();
  const annotationQueueId = router.query.queueId as string;
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:read",
  });
  const hasEntitlement = useHasOrgEntitlement("annotation-queues");

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

  if (!hasAccess || !hasEntitlement) return <SupportOrUpgradePage />;

  return (
    <FullScreenPage>
      <FeatureFlagToggle
        featureFlag="annotationQueues"
        whenEnabled={
          <>
            <Header
              title={`${queue.data?.name ?? annotationQueueId}`}
              breadcrumb={[
                {
                  name: "Annotation Queues",
                  href: `/project/${projectId}/annotation-queues`,
                },
                {
                  name: queue.data?.name ?? annotationQueueId,
                  href: `/project/${projectId}/annotation-queues/${annotationQueueId}`,
                },
              ]}
              actionButtons={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setView(view === "hideTree" ? "showTree" : "hideTree")
                  }
                  title={
                    view === "hideTree" ? "Show trace tree" : "Hide trace tree"
                  }
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
          </>
        }
      />
    </FullScreenPage>
  );
}
