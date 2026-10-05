import { Progress } from "@/src/components/design-system/Progress/Progress";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { AnnotatorShell } from "./AnnotatorShell";

export function AnnotatorHome({ projectId }: { projectId: string }) {
  const router = useRouter();
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:read",
  });
  const queues = api.annotationQueues.all.useQuery({
    projectId,
    page: 0,
    limit: 50,
  });
  const workflows = api.annotationWorkflows.publishedQueues.useQuery(
    { projectId },
    { enabled: hasReadAccess },
  );

  if (!hasReadAccess) {
    return (
      <AnnotatorShell projectId={projectId}>
        <div className="flex h-full items-center justify-center p-8">
          <Card className="max-w-md p-6 text-center">
            <LockKeyhole className="mx-auto mb-3 h-6 w-6" />
            <h1 className="text-lg">Annotation access is not enabled</h1>
            <p className="text-foreground-secondary mt-2 text-sm">
              Ask a project administrator to give you access to annotation
              queues.
            </p>
          </Card>
        </div>
      </AnnotatorShell>
    );
  }

  const helpOpen = router.query.panel === "help";
  const publishedByQueue = new Map(
    workflows.data?.map((workflow) => [workflow.queueId, workflow.versions[0]]),
  );
  const sortedQueues = [...(queues.data?.queues ?? [])].sort(
    (left, right) =>
      Number(right.isCurrentUserAssigned) - Number(left.isCurrentUserAssigned),
  );
  const remaining = sortedQueues.reduce(
    (total, queue) => total + Number(queue.countPendingItems),
    0,
  );
  const completed = sortedQueues.reduce(
    (total, queue) => total + Number(queue.countCompletedItems),
    0,
  );

  return (
    <AnnotatorShell projectId={projectId}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
          <section className="mb-8 flex flex-col gap-6 border-b pb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-foreground-secondary mb-2 text-sm">
                Your annotation workspace
              </p>
              <h1 className="text-3xl tracking-tight">Ready when you are.</h1>
              <p className="text-foreground-secondary mt-2 max-w-xl text-sm leading-relaxed">
                Work through one example at a time. Guidelines and technical
                details stay out of the way until you need them.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:min-w-72">
              <Metric label="Remaining" value={remaining} icon={Clock3} />
              <Metric label="Completed" value={completed} icon={CheckCircle2} />
            </div>
          </section>

          {helpOpen ? (
            <Card className="border-primary/30 bg-primary/5 mb-6 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm">How this workspace works</h2>
                  <p className="text-foreground-secondary mt-1 max-w-2xl text-sm leading-relaxed">
                    Open a queue, read the evidence, answer the short rubric,
                    then submit. Numeric shortcuts select visible options. Your
                    task keeps the rubric version it started with, even when an
                    administrator publishes a newer one.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    router.push(
                      router.pathname.replace("[projectId]", projectId),
                    )
                  }
                >
                  Close
                </Button>
              </div>
            </Card>
          ) : null}

          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg">My work</h2>
              <p className="text-foreground-secondary text-sm">
                Choose a queue to begin annotating.
              </p>
            </div>
          </div>

          {queues.isLoading || workflows.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-52" />
              <Skeleton className="h-52" />
            </div>
          ) : null}
          {!queues.isLoading &&
          !workflows.isLoading &&
          sortedQueues.length === 0 ? (
            <Card className="p-8 text-center">
              <h3>No annotation work yet</h3>
              <p className="text-foreground-secondary mt-2 text-sm">
                An administrator can add a queue and publish its annotation
                workflow from Studio.
              </p>
            </Card>
          ) : null}
          {!queues.isLoading &&
          !workflows.isLoading &&
          sortedQueues.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {sortedQueues.map((queue) => {
                const published = publishedByQueue.get(queue.id);
                const total =
                  Number(queue.countPendingItems) +
                  Number(queue.countCompletedItems);
                const percent = total
                  ? Math.round(
                      (Number(queue.countCompletedItems) / total) * 100,
                    )
                  : 0;
                return (
                  <Card
                    key={queue.id}
                    className="group flex min-h-52 flex-col justify-between p-5 transition-shadow hover:shadow-sm"
                  >
                    <div>
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            {queue.isCurrentUserAssigned ? (
                              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                                Assigned
                              </span>
                            ) : (
                              <span className="bg-muted text-foreground-secondary rounded-full px-2 py-0.5 text-xs">
                                Available
                              </span>
                            )}
                            {published ? (
                              <span className="text-foreground-tertiary text-xs">
                                Rubric v{published.version}
                              </span>
                            ) : null}
                          </div>
                          <h3 className="text-base">{queue.name}</h3>
                          <p className="text-foreground-secondary mt-1 line-clamp-2 text-sm">
                            {queue.description ?? "Focused review queue"}
                          </p>
                        </div>
                        <div className="bg-muted rounded-lg p-2.5">
                          <Sparkles className="text-foreground-secondary h-4 w-4" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-foreground-secondary flex justify-between text-xs">
                          <span>{queue.countCompletedItems} complete</span>
                          <span>{queue.countPendingItems} remaining</span>
                        </div>
                        <Progress value={percent} />
                      </div>
                    </div>
                    <QueueStartButton
                      projectId={projectId}
                      queueId={queue.id}
                      hasRemaining={Number(queue.countPendingItems) > 0}
                    />
                  </Card>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </AnnotatorShell>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
}) {
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <Icon className="text-foreground-secondary h-4 w-4" />
      <div>
        <p className="text-xl tabular-nums">{value}</p>
        <p className="text-foreground-tertiary text-xs">{label}</p>
      </div>
    </Card>
  );
}

function QueueStartButton({
  projectId,
  queueId,
  hasRemaining,
}: {
  projectId: string;
  queueId: string;
  hasRemaining: boolean;
}) {
  const router = useRouter();
  const nextItem = api.annotationQueues.fetchAndLockNext.useMutation();

  return (
    <Button
      className="mt-5 w-full gap-2"
      loading={nextItem.isPending}
      loadingText="Finding next task"
      disabled={!hasRemaining}
      onClick={async () => {
        try {
          const item = await nextItem.mutateAsync({
            projectId,
            queueId,
            seenItemIds: [],
          });
          if (!item) {
            toast.success("This queue is complete.");
            return;
          }
          await router.push(
            `/project/${projectId}/annotator/work/${queueId}/${item.id}`,
          );
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Unable to open the queue",
          );
        }
      }}
    >
      {hasRemaining ? "Annotate" : "Queue complete"}
      {hasRemaining ? <ArrowRight className="h-4 w-4" /> : null}
    </Button>
  );
}
