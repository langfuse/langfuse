import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Progress } from "@/src/components/design-system/Progress/Progress";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useAnnotationObjectData } from "@/src/features/annotation-queues/components/shared/hooks/useAnnotationObjectData";
import { AnnotationQueueItemPage } from "@/src/features/annotation-queues/components/AnnotationQueueItemPage";
import { useLogViewObservationIO } from "@/src/features/traces/components/TraceLogView/useLogViewObservationIO";
import { Trace } from "@/src/features/traces";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  type AnnotationQueueItem,
} from "@langfuse/shared";
import { useEventsTraceData, useReadPath } from "@/src/features/events";
import { ArrowLeft, ArrowRight, Braces, PanelTopOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  validateAnswers,
  type AnnotationAnswer,
  type AnnotationAnswers,
  type AnnotationViewSpec,
} from "../types";
import { AnnotationSpecForm } from "./AnnotationSpecForm";
import { AnnotatorShell } from "./AnnotatorShell";

export function AnnotatorWorkbench({
  projectId,
  queueId,
  itemId,
}: {
  projectId: string;
  queueId: string;
  itemId: string;
}) {
  const workflow = api.annotationWorkflows.publishedForQueue.useQuery(
    { projectId, queueId },
    {
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  if (workflow.isLoading || workflow.isFetching) {
    return (
      <AnnotatorShell projectId={projectId} compact>
        <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(400px,0.75fr)]">
          <Skeleton className="m-6" />
          <Skeleton className="m-6" />
        </div>
      </AnnotatorShell>
    );
  }

  return (
    <AnnotatorWorkbenchItem
      key={`${projectId}:${queueId}:${itemId}`}
      projectId={projectId}
      queueId={queueId}
      itemId={itemId}
      initialWorkflow={workflow.data ?? null}
    />
  );
}

function AnnotatorWorkbenchItem({
  projectId,
  queueId,
  itemId,
  initialWorkflow,
}: {
  projectId: string;
  queueId: string;
  itemId: string;
  initialWorkflow: RouterOutputs["annotationWorkflows"]["publishedForQueue"];
}) {
  const router = useRouter();
  const [workflow] = useState(initialWorkflow);
  const [answers, setAnswers] = useState<AnnotationAnswers>({});
  const [showTechnical, setShowTechnical] = useState(false);
  const item = api.annotationQueueItems.byId.useQuery({ projectId, itemId });
  const queues = api.annotationQueues.all.useQuery({
    projectId,
  });
  const objectData = useAnnotationObjectData(
    item.data as
      | (AnnotationQueueItem & {
          parentTraceId?: string | null;
        })
      | null,
    projectId,
  );
  const observation = objectData.data?.observations?.find(
    (entry: { id: string }) => entry.id === item.data?.objectId,
  );
  const isObservation =
    item.data?.objectType === AnnotationQueueObjectType.OBSERVATION;
  const observationIO = useLogViewObservationIO({
    observationId: item.data?.objectId ?? "",
    traceId: objectData.data?.id ?? "",
    projectId,
    startTime: observation?.startTime ?? new Date(0),
    enabled: isObservation && !!observation?.startTime,
  });
  const submit = api.annotationWorkflows.submit.useMutation();
  const nextItem = api.annotationQueues.fetchAndLockNext.useMutation();
  const utils = api.useUtils();

  const queue = queues.data?.queues.find((entry) => entry.id === queueId);
  const total = queue
    ? Number(queue.countCompletedItems) + Number(queue.countPendingItems)
    : 0;
  const complete = queue ? Number(queue.countCompletedItems) : 0;
  const progress = total ? Math.round((complete / total) * 100) : 0;
  const spec = workflow?.version.spec;

  const setAnswer = (questionId: string, answer: AnnotationAnswer) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (!workflow || !spec) return;
    const errors = validateAnswers(spec, answers);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    try {
      await submit.mutateAsync({
        projectId,
        queueId,
        itemId,
        workflowVersionId: workflow.version.id,
        answers,
      });
      await Promise.all([
        utils.annotationQueues.all.invalidate(),
        utils.annotationWorkflows.activity.invalidate(),
        utils.annotationWorkflows.publishedForQueue.invalidate({
          projectId,
          queueId,
        }),
      ]);
      const next = await nextItem.mutateAsync({
        projectId,
        queueId,
        seenItemIds: [itemId],
      });
      if (next) {
        await router.push({
          pathname: "/project/[projectId]/annotator/work/[queueId]/[itemId]",
          query: { projectId, queueId, itemId: next.id },
        });
      } else {
        toast.success("Queue complete. Nice work.");
        await router.push({
          pathname: "/project/[projectId]/annotator",
          query: { projectId },
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not submit annotation",
      );
    }
  };

  if (item.isLoading || objectData.isLoading || observationIO.isLoading) {
    return (
      <AnnotatorShell projectId={projectId} compact>
        <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(400px,0.75fr)]">
          <Skeleton className="m-6" />
          <Skeleton className="m-6" />
        </div>
      </AnnotatorShell>
    );
  }

  if (
    !item.data ||
    objectData.isError ||
    (isObservation && (!observation || observationIO.isError))
  ) {
    return (
      <AnnotatorShell projectId={projectId} compact>
        <div className="flex h-full items-center justify-center p-8">
          <Card className="max-w-md p-6 text-center">
            <h1>This task is unavailable</h1>
            <p className="text-foreground-secondary mt-2 text-sm">
              It may have been removed, or its source data is no longer
              available.
            </p>
            <Button asChild className="mt-5">
              <Link href={`/project/${projectId}/annotator`}>
                Back to my work
              </Link>
            </Button>
          </Card>
        </div>
      </AnnotatorShell>
    );
  }

  if (item.data.status !== AnnotationQueueStatus.PENDING) {
    return (
      <AnnotatorShell projectId={projectId} compact>
        <div className="flex h-full items-center justify-center p-8">
          <Card className="max-w-md p-6 text-center">
            <h1>This task has already been completed</h1>
            <p className="text-foreground-secondary mt-2 text-sm">
              Its saved response is preserved. Choose another task from your
              work list.
            </p>
            <Button asChild className="mt-5">
              <Link href={`/project/${projectId}/annotator`}>
                Back to my work
              </Link>
            </Button>
          </Card>
        </div>
      </AnnotatorShell>
    );
  }

  if (!workflow || !spec) {
    return (
      <AnnotatorShell projectId={projectId} compact>
        <AnnotationQueueItemPage
          annotationQueueId={queueId}
          projectId={projectId}
          queryItemId={itemId}
          navigation="annotator"
        />
      </AnnotatorShell>
    );
  }

  const evidence =
    item.data.objectType === AnnotationQueueObjectType.SESSION ? (
      <SessionEvidence
        projectId={projectId}
        sessionId={item.data.objectId}
        data={objectData.data}
        spec={spec}
      />
    ) : (
      <EvidenceView
        spec={spec}
        data={
          isObservation
            ? { ...observation, ...observationIO.data }
            : objectData.data
        }
      />
    );

  return (
    <AnnotatorShell projectId={projectId} compact>
      <div
        className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(420px,0.75fr)]"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.matches("input, textarea, select, [contenteditable=true]")
          ) {
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            handleSubmit().catch(() => undefined);
            return;
          }
          const shortcutQuestion = spec.questions.find(
            (question) =>
              question.type === "single_choice" &&
              question.options?.some(
                (option) =>
                  option.shortcut?.toLowerCase() === event.key.toLowerCase(),
              ),
          );
          const option = shortcutQuestion?.options?.find(
            (entry) =>
              entry.shortcut?.toLowerCase() === event.key.toLowerCase(),
          );
          if (shortcutQuestion && option) {
            event.preventDefault();
            setAnswer(shortcutQuestion.id, option.value);
          }
        }}
      >
        <section className="bg-background min-h-0 overflow-y-auto border-r">
          <div className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-5 py-3 backdrop-blur">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href={`/project/${projectId}/annotator`}>
                <ArrowLeft className="h-3.5 w-3.5" />
                My work
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant={showTechnical ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
                onClick={() => setShowTechnical((value) => !value)}
              >
                <Braces className="h-3.5 w-3.5" />
                {showTechnical ? "Hide trace" : "Inspect trace"}
              </Button>
            </div>
          </div>
          {showTechnical ? (
            <div className="h-[calc(100%-57px)] min-h-[600px]">
              <TechnicalTrace data={objectData.data} projectId={projectId} />
            </div>
          ) : (
            evidence
          )}
        </section>

        <aside className="bg-muted/10 flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-foreground-tertiary text-xs">
                  {queue?.name ?? "Annotation queue"} · rubric v
                  {workflow.version.version}
                </span>
                <span className="text-foreground-tertiary text-xs tabular-nums">
                  {complete}/{total}
                </span>
              </div>
              <Progress value={progress} />
            </div>
            <h1 className="text-xl">{spec.title}</h1>
            <p className="text-foreground-secondary mt-2 text-sm leading-relaxed">
              {spec.summary}
            </p>
            <details className="bg-background mt-4 rounded-md border p-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <PanelTopOpen className="h-4 w-4" />
                Review guidelines
              </summary>
              <ol className="text-foreground-secondary mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed">
                {spec.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
            </details>
            <div className="my-6 border-t" />
            <AnnotationSpecForm
              spec={spec}
              answers={answers}
              onAnswer={setAnswer}
            />
          </div>
          <div className="bg-background shrink-0 border-t p-4">
            <Button
              className="h-10 w-full gap-2"
              loading={submit.isPending || nextItem.isPending}
              loadingText="Saving & finding next"
              onClick={() => handleSubmit().catch(() => undefined)}
            >
              {spec.submitLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-foreground-tertiary mt-2 flex items-center justify-center gap-1.5 text-xs">
              <KeyboardShortcut keys={["Mod", "Enter"]} />
              to submit
            </p>
          </div>
        </aside>
      </div>
    </AnnotatorShell>
  );
}

function SessionEvidence({
  projectId,
  sessionId,
  data,
  spec,
}: {
  projectId: string;
  sessionId: string;
  data: { traces?: { id: string; name?: string | null; timestamp?: Date }[] };
  spec: AnnotationViewSpec;
}) {
  const { isV4 } = useReadPath();
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const eventTraces = api.sessions.tracesFromEvents.useQuery(
    { projectId, sessionId },
    { enabled: isV4 },
  );
  const traces = isV4 ? (eventTraces.data ?? []) : (data.traces ?? []);
  const traceId = selectedTraceId || traces[0]?.id || "";
  const eventTrace = useEventsTraceData({
    projectId,
    traceId,
    enabled: isV4 && !!traceId,
  });
  const legacyTrace = api.traces.byIdWithObservationsAndScores.useQuery(
    { projectId, traceId },
    { enabled: !isV4 && !!traceId },
  );
  const trace = isV4 ? eventTrace.data : legacyTrace.data;
  const traceLoading = isV4 ? eventTrace.isLoading : legacyTrace.isLoading;
  const traceError = isV4 ? !!eventTrace.error : legacyTrace.isError;

  return (
    <div className="ph-no-capture mx-auto max-w-4xl space-y-6 p-6 md:p-10">
      <div>
        <p className="text-foreground-secondary mb-2 text-sm">
          Session evidence
        </p>
        <h2 className="text-2xl tracking-tight">Review each exchange.</h2>
        <p className="text-foreground-secondary mt-2 text-sm">
          {traces.length} traces in this session. Choose a trace to read its
          input and output.
        </p>
      </div>
      {eventTraces.isLoading && isV4 ? <Skeleton className="h-28" /> : null}
      {traces.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {traces.map((entry, index) => (
            <Button
              key={entry.id}
              size="sm"
              variant={entry.id === traceId ? "secondary" : "outline"}
              onClick={() => setSelectedTraceId(entry.id)}
            >
              {index + 1}. {entry.name || "Trace"}
            </Button>
          ))}
        </div>
      ) : null}
      {traceLoading ? <Skeleton className="h-48" /> : null}
      {trace && !traceLoading ? (
        <EvidenceView spec={spec} data={trace} />
      ) : null}
      {traceError || (!traceLoading && traces.length === 0) ? (
        <Card className="p-5 text-sm">
          The exchange preview is unavailable. Open the full session for the
          complete evidence.
        </Card>
      ) : null}
      <Button asChild variant="outline" size="sm">
        <Link href={`/project/${projectId}/sessions/${sessionId}`}>
          Open full session
        </Link>
      </Button>
    </div>
  );
}

function EvidenceView({
  spec,
  data,
}: {
  spec: AnnotationViewSpec;
  data: Record<string, unknown> | undefined;
}) {
  const fields = spec.evidence
    .map((binding) => ({ binding, value: data?.[binding] }))
    .filter((entry) => entry.value !== undefined && entry.value !== null);

  const content: ReactNode = (() => {
    if (fields.length === 0) {
      return (
        <Card className="p-6">
          <p className="text-foreground-secondary text-sm">
            This source does not expose the configured evidence fields. Use
            Inspect trace for the complete technical view.
          </p>
        </Card>
      );
    }
    if (spec.layout === "conversation") {
      return (
        <div className="space-y-5">
          {fields.map((field, index) => (
            <div
              key={field.binding}
              className={`flex ${index % 2 === 1 ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-5 py-4 ${
                  index % 2 === 1
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                }`}
              >
                <p className="mb-2 text-xs opacity-70">
                  {evidenceLabel(field.binding)}
                </p>
                <ReadableValue value={field.value} />
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {fields.map((field) => (
          <Card key={field.binding} className="overflow-hidden">
            <div className="bg-muted/40 border-b px-4 py-2 text-xs tracking-wide uppercase">
              {field.binding}
            </div>
            <div className="p-5">
              <ReadableValue value={field.value} />
            </div>
          </Card>
        ))}
      </div>
    );
  })();

  return (
    <div className="ph-no-capture mx-auto max-w-4xl p-6 md:p-10">
      <div className="mb-8">
        <p className="text-foreground-secondary mb-2 text-sm">Evidence</p>
        <h2 className="text-2xl tracking-tight">Read the exchange first.</h2>
      </div>
      {content}
    </div>
  );
}

function evidenceLabel(binding: "input" | "output" | "metadata") {
  if (binding === "input") return "User";
  if (binding === "output") return "Assistant";
  return "Context";
}

function ReadableValue({ value }: { value: unknown }) {
  const text = readableText(value);
  return <p className="text-sm leading-7 whitespace-pre-wrap">{text}</p>;
}

function readableText(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value, null, 2) ?? "";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1
    ) {
      const onlyValue = Object.values(parsed)[0];
      if (typeof onlyValue === "string") return onlyValue;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

function TechnicalTrace({ data, projectId }: { data: any; projectId: string }) {
  if (!data?.observations || !data?.id) {
    return (
      <div className="ph-no-capture p-6">
        <pre className="overflow-auto text-xs whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  }
  return (
    <Trace
      trace={data}
      scores={data.scores ?? []}
      corrections={data.corrections ?? []}
      projectId={projectId}
      observations={data.observations}
      context="annotation"
    />
  );
}
