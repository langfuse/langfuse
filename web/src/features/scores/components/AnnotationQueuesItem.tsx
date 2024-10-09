import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import useSessionStorage from "@/src/components/useSessionStorage";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import { FeatureFlagToggle } from "@/src/features/feature-flags/components/FeatureFlagToggle";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotationQueueItemPage } from "@/src/features/scores/components/AnnotationQueueItemPage";
import { api } from "@/src/utils/api";
import { Goal, Network } from "lucide-react";

export const AnnotationQueuesItem = ({
  annotationQueueId,
  projectId,
  itemId,
}: {
  annotationQueueId: string;
  projectId: string;
  itemId?: string;
}) => {
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
                <Tabs
                  value={view}
                  onValueChange={(view: string) => {
                    setView(view as "hideTree" | "showTree");
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="hideTree">
                      <Goal className="mr-1 h-4 w-4"></Goal>
                      Focused
                    </TabsTrigger>
                    <TabsTrigger value="showTree">
                      <Network className="mr-1 h-4 w-4"></Network>
                      Detailed
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              }
            />
            <AnnotationQueueItemPage
              projectId={projectId}
              annotationQueueId={annotationQueueId}
              view={view}
              queryItemId={itemId}
            />
          </>
        }
      />
    </FullScreenPage>
  );
};
