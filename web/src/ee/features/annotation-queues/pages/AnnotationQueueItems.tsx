import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { AnnotationQueueItemsTable } from "@/src/ee/features/annotation-queues/components/AnnotationQueueItemsTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { ChevronRight, ClipboardPen, Lock } from "lucide-react";
import { Separator } from "@/src/components/ui/separator";
import { useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import Link from "next/link";
import { CreateOrEditAnnotationQueueButton } from "@/src/ee/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { Skeleton } from "@/src/components/ui/skeleton";

const TableWithMetadataWrapper = ({
  tableComponent,
  cardTitleChildren,
  cardContentChildren,
}: {
  tableComponent: React.ReactNode;
  cardTitleChildren: React.ReactNode;
  cardContentChildren: React.ReactNode;
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={`grid h-[calc(100dvh-8rem)] ${isCollapsed ? "grid-cols-[2fr,auto]" : "grid-cols-[2fr,1fr]"} gap-4 overflow-hidden lg:h-[calc(100dvh-4rem)]`}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {tableComponent}
      </div>
      <div
        className={`my-2 flex flex-row ${isCollapsed ? "w-8" : "w-full"} h-full overflow-hidden`}
      >
        <div className="grid h-full w-full grid-cols-[auto,1fr] items-start gap-2 overflow-hidden">
          <div className="grid h-full w-full grid-rows-[auto,1fr] gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <ChevronRight
                className={`h-4 w-4 transform ${isCollapsed ? "rotate-180" : ""}`}
              />
            </Button>
            <Separator orientation="vertical" className="ml-4 h-full" />
          </div>
          <div
            className={`${isCollapsed ? "hidden" : "block"} mt-8 grid h-[calc(100%-2rem)] w-full grid-rows-[auto,1fr] gap-2 overflow-hidden p-2`}
          >
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="flex h-full overflow-y-auto">
                <CardHeader className="flex h-full w-full flex-col space-y-4">
                  <CardTitle className="flex justify-between text-xl font-bold leading-7 sm:tracking-tight">
                    {cardTitleChildren}
                  </CardTitle>
                  <CardContent className="flex-1 space-y-4 p-0">
                    {cardContentChildren}
                  </CardContent>
                </CardHeader>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function QueueItems() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const queueId = router.query.queueId as string;

  const queue = api.annotationQueues.byId.useQuery({
    queueId,
    projectId,
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const hasEntitlement = useHasOrgEntitlement("annotation-queues");
  if (!hasReadAccess || !hasEntitlement) return <SupportOrUpgradePage />;

  return (
    <FullScreenPage>
      <>
        <Header
          title={queue.data?.name ?? queueId}
          breadcrumb={[
            {
              name: "Annotation Queues",
              href: `/project/${projectId}/annotation-queues`,
            },
            { name: queue.data?.name ?? queueId },
          ]}
          actionButtons={
            !hasWriteAccess ? (
              <Button disabled>
                <Lock className="mr-1 h-4 w-4" />
                <span className="text-sm">Process queue</span>
              </Button>
            ) : (
              <Button asChild>
                <Link
                  href={`/project/${projectId}/annotation-queues/${queueId}/items`}
                >
                  <ClipboardPen className="mr-1 h-4 w-4" />
                  <span className="text-sm">Process queue</span>
                </Link>
              </Button>
            )
          }
        />
        <TableWithMetadataWrapper
          tableComponent={
            <AnnotationQueueItemsTable
              projectId={projectId}
              queueId={queueId}
            />
          }
          cardTitleChildren={
            <div className="flex w-full flex-row items-center justify-between">
              {queue.data ? (
                <span>{queue.data.name}</span>
              ) : (
                <Skeleton className="h-full w-1/2" />
              )}
              <CreateOrEditAnnotationQueueButton
                projectId={projectId}
                queueId={queueId}
              />
            </div>
          }
          cardContentChildren={
            <>
              {queue.data?.description && (
                <CardDescription className="text-sm">
                  {queue.data?.description}
                </CardDescription>
              )}
              <Separator orientation="horizontal" />
              <h5 className="text-md font-bold leading-7 sm:tracking-tight">
                Score Configs
              </h5>
              {queue.data?.scoreConfigs.map((scoreConfig) => (
                <Badge key={scoreConfig.id} className="mr-2" variant="outline">
                  {getScoreDataTypeIcon(scoreConfig.dataType)}
                  <span className="ml-0.5">{scoreConfig.name}</span>
                </Badge>
              ))}
            </>
          }
        />
      </>
    </FullScreenPage>
  );
}
