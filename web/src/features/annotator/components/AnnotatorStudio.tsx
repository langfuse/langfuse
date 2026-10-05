import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  FileClock,
  ListChecks,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { supportedModels } from "@langfuse/shared";
import {
  AnnotationViewSpecSchema,
  type AnnotationAnswers,
  type AnnotationViewSpec,
} from "../types";
import { AnnotationSpecForm } from "./AnnotationSpecForm";
import { AnnotatorShell } from "./AnnotatorShell";
import { WorkflowSpecEditor } from "./WorkflowSpecEditor";

type StudioTab = "overview" | "setup" | "activity";

const DEFAULT_PROMPT =
  "Create a concise quality review for customer-support responses. Add four questions: a required single-choice verdict with Pass, Minor issue, and Major issue options; a required yes/no groundedness check; a required confidence scale from 1 to 5; and an optional free-text note. Keep the verdict above the fold.";
const INSTANCE_AI_CONNECTION = "__instance_ai__";

export function AnnotatorStudio({ projectId }: { projectId: string }) {
  const router = useRouter();
  const hasAdminAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const [tab, setTab] = useState<StudioTab>(
    typeof router.query.queue === "string" ? "setup" : "overview",
  );
  const [selectedQueue, setSelectedQueue] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [previewAnswers, setPreviewAnswers] = useState<AnnotationAnswers>({});

  const queues = api.annotationQueues.all.useQuery({
    projectId,
  });
  const workflows = api.annotationWorkflows.list.useQuery(
    { projectId },
    { enabled: hasAdminAccess },
  );
  const activity = api.annotationWorkflows.activity.useQuery(
    { projectId },
    { enabled: hasAdminAccess },
  );
  const connections = api.llmApiKey.all.useQuery(
    { projectId },
    { enabled: hasAdminAccess },
  );
  const generationModel = api.annotationWorkflows.generationModel.useQuery(
    { projectId },
    { enabled: hasAdminAccess },
  );
  const utils = api.useUtils();
  const generate = api.annotationWorkflows.generateDraft.useMutation();
  const saveStarter = api.annotationWorkflows.saveStarter.useMutation();
  const saveDraft = api.annotationWorkflows.saveDraft.useMutation();
  const publish = api.annotationWorkflows.publish.useMutation();

  const queueId =
    selectedQueue ||
    (typeof router.query.queue === "string" ? router.query.queue : "") ||
    queues.data?.queues[0]?.id ||
    "";
  const connectionKey =
    selectedProvider ||
    (generationModel.data
      ? INSTANCE_AI_CONNECTION
      : connections.data?.data[0]?.provider) ||
    "";
  const usesInstanceAI = connectionKey === INSTANCE_AI_CONNECTION;
  const connection = connections.data?.data.find(
    (item) => item.provider === connectionKey,
  );
  const availableModels: string[] = (() => {
    if (usesInstanceAI && generationModel.data) {
      return [generationModel.data.modelId];
    }
    if (connection) {
      return [
        ...connection.customModels,
        ...(connection.withDefaultModels
          ? supportedModels[connection.adapter]
          : []),
      ];
    }
    return [];
  })();
  const model =
    (availableModels.includes(selectedModel)
      ? selectedModel
      : availableModels[0]) ?? "";
  const workflow = workflows.data?.find((item) => item.queueId === queueId);
  const selectedStoredVersion = workflow?.versions.find(
    (version) => version.id === selectedVersionId,
  );
  const selectedMutationVersion = [
    saveDraft.data,
    generate.data,
    saveStarter.data,
  ].find((version) => version?.id === selectedVersionId);
  const visibleVersion =
    selectedStoredVersion ?? selectedMutationVersion ?? workflow?.versions[0];
  const liveVersion = workflow?.versions
    .filter((version) => version.publishedAt)
    .sort(
      (left, right) =>
        new Date(right.publishedAt!).getTime() -
        new Date(left.publishedAt!).getTime(),
    )[0];
  const visibleVersionStatus = visibleVersion
    ? getVersionStatus(
        visibleVersion.id,
        visibleVersion.publishedAt,
        liveVersion?.id,
      )
    : "draft";
  const parsedSpec = AnnotationViewSpecSchema.safeParse(visibleVersion?.spec);
  const spec = parsedSpec.success ? parsedSpec.data : undefined;
  const publishedCount =
    workflows.data?.filter((item) =>
      item.versions.some((version) => version.publishedAt),
    ).length ?? 0;

  if (!hasAdminAccess) {
    return (
      <AnnotatorShell projectId={projectId} mode="studio">
        <div className="flex h-full items-center justify-center p-8">
          <Card className="max-w-md p-6 text-center">
            <h1 className="text-lg">Studio is for annotation administrators</h1>
            <p className="text-foreground-secondary mt-2 text-sm">
              You can still use the focused annotator workspace, but you cannot
              change or publish its workflows.
            </p>
          </Card>
        </div>
      </AnnotatorShell>
    );
  }

  const refreshWorkflowData = async () => {
    await Promise.all([
      utils.annotationWorkflows.list.invalidate(),
      utils.annotationWorkflows.publishedForQueue.invalidate(),
      utils.annotationWorkflows.activity.invalidate(),
    ]);
  };

  return (
    <AnnotatorShell projectId={projectId} mode="studio">
      <div className="flex h-full min-h-0 flex-col">
        <div className="bg-background shrink-0 border-b px-5 pt-7 md:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6">
              <p className="text-foreground-secondary mb-1 text-sm">
                Annotation Studio
              </p>
              <h1 className="text-2xl tracking-tight">Annotation workflows</h1>
            </div>
            <nav className="flex gap-6">
              {(
                [
                  ["overview", "Overview"],
                  ["setup", "Setup & publish"],
                  ["activity", "Activity"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`border-b-2 pb-3 text-sm transition-colors ${
                    tab === value
                      ? "border-primary text-foreground"
                      : "text-foreground-secondary border-transparent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
          <div className="mx-auto max-w-7xl">
            {tab === "overview" ? (
              <StudioOverview
                queueCount={queues.data?.totalCount ?? 0}
                workflowCount={workflows.data?.length ?? 0}
                publishedCount={publishedCount}
                responseCount={activity.data?.length ?? 0}
                loading={queues.isLoading || workflows.isLoading}
                onSetup={() => setTab("setup")}
              />
            ) : null}

            {tab === "setup" ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(480px,1.2fr)]">
                <Card className="h-fit p-5">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="bg-primary/10 rounded-lg p-2">
                      <WandSparkles className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base">Describe the review</h2>
                      <p className="text-foreground-secondary mt-1 text-sm">
                        AI drafts a bounded spec from trusted controls. Every
                        draft is saved as a new immutable version.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <label className="block space-y-1.5 text-sm">
                      <span>Queue</span>
                      <select
                        className="bg-background h-9 w-full rounded-md border px-3 text-sm"
                        value={queueId}
                        onChange={(event) => {
                          setSelectedQueue(event.target.value);
                          setPreviewAnswers({});
                          setSelectedVersionId("");
                          generate.reset();
                          saveStarter.reset();
                          saveDraft.reset();
                        }}
                      >
                        {queues.data?.queues.map((queue) => (
                          <option key={queue.id} value={queue.id}>
                            {queue.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="ph-no-capture block space-y-1.5 text-sm">
                      <span>What should annotators decide?</span>
                      <Textarea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        rows={7}
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-sm">
                        <span>Connection</span>
                        <select
                          className="bg-background h-9 w-full rounded-md border px-3 text-sm"
                          value={connectionKey}
                          onChange={(event) => {
                            setSelectedProvider(event.target.value);
                            setSelectedModel("");
                          }}
                        >
                          {generationModel.data ? (
                            <option value={INSTANCE_AI_CONNECTION}>
                              Instance AI ({generationModel.data.provider})
                            </option>
                          ) : null}
                          {connections.data?.data.map((item) => (
                            <option key={item.id} value={item.provider}>
                              {item.provider}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span>Model</span>
                        <select
                          className="bg-background h-9 w-full rounded-md border px-3 text-sm"
                          value={model}
                          onChange={(event) =>
                            setSelectedModel(event.target.value)
                          }
                        >
                          {availableModels.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {!generationModel.data &&
                    connections.data?.data.length === 0 ? (
                      <p className="text-destructive text-xs">
                        Add a model connection in Langfuse settings before using
                        AI generation.
                      </p>
                    ) : null}
                    {usesInstanceAI ? (
                      <p className="text-foreground-tertiary text-xs">
                        Uses the server-configured model and keeps provider
                        credentials out of this workflow.
                      </p>
                    ) : null}
                    {!usesInstanceAI && connections.data?.data.length ? (
                      <p className="text-foreground-tertiary text-xs">
                        Only model connections configured for this project are
                        available here.
                      </p>
                    ) : null}
                    {!usesInstanceAI &&
                    connections.data?.data.length !== 0 &&
                    connection &&
                    availableModels.length === 0 ? (
                      <p className="text-destructive text-xs">
                        This connection has no configured models.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2 border-t pt-5">
                      <Button
                        className="gap-2"
                        loading={generate.isPending}
                        loadingText="Designing"
                        disabled={
                          generationModel.isLoading ||
                          !queueId ||
                          !model ||
                          prompt.length < 10
                        }
                        onClick={async () => {
                          if (!usesInstanceAI && !connection) return;
                          try {
                            const version = await generate.mutateAsync({
                              projectId,
                              queueId,
                              prompt,
                              source: usesInstanceAI ? "instance" : "project",
                              provider: connection?.provider,
                              model,
                            });
                            setSelectedVersionId(version.id);
                            setPreviewAnswers({});
                            await refreshWorkflowData();
                            toast.success("Draft saved as a new version.");
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "AI generation failed",
                            );
                          }
                        }}
                      >
                        <Sparkles className="h-4 w-4" />
                        Generate draft
                      </Button>
                      <Button
                        variant="outline"
                        loading={saveStarter.isPending}
                        disabled={!queueId}
                        onClick={async () => {
                          try {
                            const version = await saveStarter.mutateAsync({
                              projectId,
                              queueId,
                            });
                            setSelectedVersionId(version.id);
                            setPreviewAnswers({});
                            await refreshWorkflowData();
                            toast.success("Starter draft saved.");
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not save starter",
                            );
                          }
                        }}
                      >
                        Use starter
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="bg-muted/30 flex items-center justify-between border-b px-5 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Eye className="h-4 w-4" />
                      Live annotator preview
                    </div>
                    {visibleVersion ? (
                      <select
                        aria-label="Workflow version"
                        className="bg-background h-8 rounded-md border px-2 text-xs"
                        value={visibleVersion.id}
                        onChange={(event) => {
                          setSelectedVersionId(event.target.value);
                          setPreviewAnswers({});
                        }}
                      >
                        {workflow?.versions.map((version) => (
                          <option key={version.id} value={version.id}>
                            v{version.version} ·{" "}
                            {formatVersionStatus(
                              getVersionStatus(
                                version.id,
                                version.publishedAt,
                                liveVersion?.id,
                              ),
                            )}
                          </option>
                        ))}
                        {selectedMutationVersion &&
                        !workflow?.versions.some(
                          (version) =>
                            version.id === selectedMutationVersion.id,
                        ) ? (
                          <option
                            value={selectedMutationVersion.id}
                            key={selectedMutationVersion.id}
                          >
                            v{selectedMutationVersion.version} · Draft
                          </option>
                        ) : null}
                      </select>
                    ) : null}
                  </div>
                  {spec && visibleVersion ? (
                    <div className="ph-no-capture">
                      <div className="border-b p-6">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                            {spec.layout.replace("_", " ")}
                          </span>
                          <span className="text-foreground-tertiary text-xs">
                            {spec.assistance.replaceAll("_", " ")} assistance
                          </span>
                        </div>
                        <h2 className="text-xl">{spec.title}</h2>
                        <p className="text-foreground-secondary mt-2 text-sm leading-relaxed">
                          {spec.summary}
                        </p>
                        <details className="mt-4 rounded-md border p-3 text-sm">
                          <summary className="cursor-pointer">
                            Guidelines
                          </summary>
                          <ol className="text-foreground-secondary mt-3 list-decimal space-y-1.5 pl-5 text-xs">
                            {spec.instructions.map((instruction) => (
                              <li key={instruction}>{instruction}</li>
                            ))}
                          </ol>
                        </details>
                      </div>
                      <div className="p-6">
                        <AnnotationSpecForm
                          spec={spec}
                          answers={previewAnswers}
                          onAnswer={(id, value) =>
                            setPreviewAnswers((current) => ({
                              ...current,
                              [id]: value,
                            }))
                          }
                        />
                      </div>
                      <div className="bg-background sticky bottom-0 flex items-center justify-between border-t px-6 py-4">
                        <span className="text-foreground-tertiary text-xs">
                          Preview only · no answers are saved
                        </span>
                        <Button
                          loading={publish.isPending}
                          disabled={
                            !visibleVersion.workflowId ||
                            visibleVersion.id === liveVersion?.id
                          }
                          onClick={async () => {
                            try {
                              await publish.mutateAsync({
                                projectId,
                                workflowId: visibleVersion.workflowId,
                                versionId: visibleVersion.id,
                              });
                              await refreshWorkflowData();
                              toast.success(
                                `Version ${visibleVersion.version} is live.`,
                              );
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Could not publish",
                              );
                            }
                          }}
                        >
                          {visibleVersion.id === liveVersion?.id
                            ? `Live v${visibleVersion.version}`
                            : `Publish v${visibleVersion.version}`}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[560px] flex-col items-center justify-center p-8 text-center">
                      <WandSparkles className="text-foreground-tertiary mb-4 h-7 w-7" />
                      <h3>Generate or choose a starter</h3>
                      <p className="text-foreground-secondary mt-2 max-w-sm text-sm">
                        The preview is rendered by the same trusted component
                        catalog annotators use.
                      </p>
                    </div>
                  )}
                </Card>

                {spec && visibleVersion ? (
                  <div className="xl:col-span-2">
                    <WorkflowSpecEditor
                      key={visibleVersion.id}
                      initialSpec={spec}
                      initialVersion={visibleVersion.version}
                      status={visibleVersionStatus}
                      saving={saveDraft.isPending}
                      onSave={async (nextSpec: AnnotationViewSpec) => {
                        try {
                          const version = await saveDraft.mutateAsync({
                            projectId,
                            queueId,
                            spec: nextSpec,
                          });
                          setSelectedVersionId(version.id);
                          setPreviewAnswers({});
                          await refreshWorkflowData();
                          toast.success(
                            `Draft v${version.version} saved. The live version is unchanged.`,
                          );
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not save draft",
                          );
                        }
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "activity" ? (
              <ActivityList
                loading={activity.isLoading}
                items={activity.data ?? []}
              />
            ) : null}
          </div>
        </div>
      </div>
    </AnnotatorShell>
  );
}

function getVersionStatus(
  versionId: string,
  publishedAt: Date | null,
  liveVersionId: string | undefined,
): "live" | "draft" | "published" {
  if (versionId === liveVersionId) return "live";
  return publishedAt ? "published" : "draft";
}

function formatVersionStatus(status: "live" | "draft" | "published") {
  if (status === "live") return "Live";
  if (status === "published") return "Published";
  return "Draft";
}

function StudioOverview({
  queueCount,
  workflowCount,
  publishedCount,
  responseCount,
  loading,
  onSetup,
}: {
  queueCount: number;
  workflowCount: number;
  publishedCount: number;
  responseCount: number;
  loading: boolean;
  onSetup: () => void;
}) {
  if (loading) return <Skeleton className="h-72" />;
  const metrics = [
    { label: "Queues", value: queueCount, icon: ListChecks },
    { label: "Configured", value: workflowCount, icon: FileClock },
    { label: "Published", value: publishedCount, icon: CheckCircle2 },
    { label: "Recent responses", value: responseCount, icon: Activity },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-foreground-secondary text-sm">{label}</span>
              <Icon className="text-foreground-tertiary h-4 w-4" />
            </div>
            <p className="text-3xl tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-6">
          <p className="text-foreground-secondary mb-2 text-sm">Queue health</p>
          <h2 className="text-xl">Build clarity before measuring speed.</h2>
          <p className="text-foreground-secondary mt-2 max-w-2xl text-sm leading-relaxed">
            This view intentionally avoids annotator leaderboards. The next
            useful metrics are ambiguity, disagreement, rework, and queues that
            are blocked—not who clicks fastest.
          </p>
          <Button onClick={onSetup} className="mt-6 gap-2">
            Configure a workflow
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </Card>
        <Card className="p-6">
          <p className="text-foreground-secondary mb-4 text-sm">
            Explicit spike boundaries
          </p>
          <ul className="text-foreground-secondary space-y-3 text-sm">
            <li>• No arbitrary generated React or HTML</li>
            <li>• No assignment-based authorization yet</li>
            <li>• No consensus or adjudication yet</li>
            <li>• Legacy scores become a later output adapter</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

type ActivityItem = {
  id: string;
  submittedAt: Date;
  status: string;
  user: { id: string; name: string | null; image: string | null };
  item: {
    id: string;
    objectType: string;
    queue: { id: string; name: string };
  };
  workflowVersion: { id: string; version: number; source: string };
};

function ActivityList({
  loading,
  items,
}: {
  loading: boolean;
  items: ActivityItem[];
}) {
  if (loading) return <Skeleton className="h-72" />;
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-4">
        <h2>Annotation activity</h2>
        <p className="text-foreground-secondary mt-1 text-sm">
          Durable actions from the new response model, including the exact
          workflow version used.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="p-10 text-center">
          <Activity className="text-foreground-tertiary mx-auto mb-3 h-6 w-6" />
          <p className="text-sm">No responses submitted yet.</p>
        </div>
      ) : (
        <div className="divide-y">
          {items.map((item) => (
            <div
              key={item.id}
              className="ph-no-capture grid gap-2 px-5 py-4 text-sm md:grid-cols-[1fr_1fr_auto] md:items-center"
            >
              <div>
                <p>{item.user.name ?? "Unknown annotator"}</p>
                <p className="text-foreground-tertiary text-xs">
                  Submitted {item.item.objectType.toLowerCase()} review
                </p>
              </div>
              <div>
                <p>{item.item.queue.name}</p>
                <p className="text-foreground-tertiary text-xs">
                  Workflow v{item.workflowVersion.version} ·{" "}
                  {item.workflowVersion.source}
                </p>
              </div>
              <time className="text-foreground-secondary text-xs">
                {new Date(item.submittedAt).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
