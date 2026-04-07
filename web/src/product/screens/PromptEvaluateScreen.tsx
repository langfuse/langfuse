import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { extractVariables } from "@langfuse/shared";
import {
  CheckCircle2,
  Bot,
  ChevronDown,
  Braces,
  CirclePlus,
  Coins,
  LoaderCircle,
  MinusCircle,
  Play,
  Search,
  Timer,
  Trash2,
  Type,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import { PromptFrame } from "../frames/PromptFrame";
import {
  PREVIEW_MODELS,
  PREVIEW_PROMPT_MESSAGES,
  PREVIEW_TOOL_CHIPS,
  PromptDraftPane,
  type PromptMessage,
  type PromptMessageRole,
} from "./PromptIterateScreen";
import {
  getPromptBreadcrumbs,
  getWorkspaceSelectionLabel,
  resolvePromptPreviewSlug,
} from "../shell/product-manifest";

type EvaluatorCategory = "AI-Powered" | "Performance" | "Code";

type EvaluatorOption = {
  id: string;
  category: EvaluatorCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  tintClass: string;
  iconClass: string;
};

type EvaluatorComparator = "less than" | "greater than" | "equal to";

type TextMatcherComparator = "contains" | "equals" | "starts with";

type EvaluatorInstance = {
  id: string;
  evaluatorId: EvaluatorOption["id"];
  title: string;
  datasetId: string;
  isCollapsed: boolean;
  judgePrompt: string;
  thresholdOperator: EvaluatorComparator;
  thresholdValue: string;
  thresholdUnit: string;
  code: string;
  matcherOperator: TextMatcherComparator;
  matcherValue: string;
};

type EvaluatePaneMode = "builder" | "running" | "results";

type MockEvaluationStatus = "passed" | "failed" | "unknown";

type MockEvaluationRow = {
  id: string;
  status: MockEvaluationStatus;
  reason: string;
  response: string;
  variables: Array<{ key: string; value: string }>;
};

type MockEvaluationSection = {
  evaluatorInstanceId: string;
  evaluatorTitle: string;
  evaluatorSubtitle: string;
  counts: Record<MockEvaluationStatus, number>;
  rows: MockEvaluationRow[];
};

type MockEvaluationRun = {
  id: string;
  startedAtLabel: string;
  counts: Record<MockEvaluationStatus, number>;
  total: number;
  sections: MockEvaluationSection[];
};

type PersistedEvaluateState = {
  evaluators: EvaluatorInstance[];
  mode: Exclude<EvaluatePaneMode, "running">;
  activeRun: MockEvaluationRun | null;
};

const PREVIEW_EVALUATOR_OPTIONS: EvaluatorOption[] = [
  {
    id: "llm-judge",
    category: "AI-Powered",
    label: "LLM as a Judge",
    description: "Evaluate using natural language",
    icon: Bot,
    tintClass: "bg-lime-500/10 border-lime-500/16",
    iconClass: "bg-lime-500/12 text-lime-700 dark:text-lime-300",
  },
  {
    id: "cost",
    category: "Performance",
    label: "Cost",
    description: "Cost of the response",
    icon: Coins,
    tintClass: "bg-amber-500/8 border-amber-500/14",
    iconClass: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  {
    id: "latency",
    category: "Performance",
    label: "Latency",
    description: "Time to get a full response",
    icon: Timer,
    tintClass: "bg-amber-500/8 border-amber-500/14",
    iconClass: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  {
    id: "response-length",
    category: "Performance",
    label: "Response Length",
    description: "Word, character, or token count",
    icon: Type,
    tintClass: "bg-amber-500/8 border-amber-500/14",
    iconClass: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  {
    id: "javascript",
    category: "Code",
    label: "JavaScript",
    description: "Write a JavaScript code",
    icon: Braces,
    tintClass: "bg-sky-500/8 border-sky-500/14",
    iconClass: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
  {
    id: "text-matcher",
    category: "Code",
    label: "Text Matcher",
    description: "Match text with various operators",
    icon: Search,
    tintClass: "bg-sky-500/8 border-sky-500/14",
    iconClass: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
] as const;

const PREVIEW_EVALUATION_DATASETS = [
  { id: "dataset-support", label: "Support inbox" },
  { id: "dataset-escalations", label: "Escalations" },
  { id: "dataset-enterprise", label: "Enterprise tickets" },
] as const;

const MOCK_EVALUATION_DATASETS = {
  "dataset-support": [
    {
      id: "support-1",
      response:
        "Key points: session-filtered CSV exports drop payload rows. Next action: route to support-escalations with a reproducible filtered trace sample.",
      variables: {
        product_area: "Observability exports",
        issue_summary:
          "Customer cannot export filtered traces to CSV when a session filter is active.",
        routing_queue: "support-escalations",
        customer_tone: "calm and direct",
      },
    },
    {
      id: "support-2",
      response:
        "Key points: retrying the export job times out after payload hydration. Next action: collect failing trace IDs and ownership notes for the export worker.",
      variables: {
        product_area: "Export jobs",
        issue_summary:
          "Large trace exports stall after the user retries the same session-scoped request.",
        routing_queue: "support-platform",
        customer_tone: "neutral and operational",
      },
    },
    {
      id: "support-3",
      response:
        "Key points: collector credentials rotated successfully but ingestion lag remains. Next action: confirm whether the workspace still routes traffic to the old collector pool.",
      variables: {
        product_area: "Trace ingestion",
        issue_summary:
          "Enterprise workspace reports delayed trace ingestion after rotating collector credentials.",
        routing_queue: "support-platform",
        customer_tone: "measured and confident",
      },
    },
    {
      id: "support-4",
      response:
        "Key points: duplicate charge likely came from a retried upgrade checkout. Next action: review billing event deduplication before replying to the customer.",
      variables: {
        product_area: "Billing",
        issue_summary:
          "Customer was double charged after retrying a failed upgrade checkout.",
        routing_queue: "support-billing",
        customer_tone: "calm and reassuring",
      },
    },
  ],
  "dataset-escalations": [
    {
      id: "escalation-1",
      response:
        "Escalation summary: outage mitigation is in progress, but response text does not include a rollback owner.",
      variables: {
        product_area: "Incident response",
        issue_summary:
          "EU region export errors increased 4x after the latest deploy window.",
        routing_queue: "incident-command",
        customer_tone: "direct and calm",
      },
    },
    {
      id: "escalation-2",
      response:
        "Escalation summary: customer-visible lag is acknowledged, but the handoff skipped the current mitigation timeline.",
      variables: {
        product_area: "Trace ingestion",
        issue_summary:
          "High-volume enterprise workspace sees 12 minute ingestion delay during peak traffic.",
        routing_queue: "support-platform",
        customer_tone: "measured and confident",
      },
    },
    {
      id: "escalation-3",
      response:
        "Escalation summary: failed import path is isolated to one storage region. Next action is clear and correctly routed.",
      variables: {
        product_area: "Blob storage imports",
        issue_summary:
          "Customers in us-east cannot import compressed logs from S3 after enabling new credentials.",
        routing_queue: "support-integrations",
        customer_tone: "neutral and operational",
      },
    },
  ],
  "dataset-enterprise": [
    {
      id: "enterprise-1",
      response:
        "Executive-ready summary: dashboard conversion improvements are promising, but response overstates certainty on retention gains.",
      variables: {
        product_area: "Analytics dashboards",
        issue_summary:
          "Leadership requested a concise dashboard summary for this week’s activation experiments.",
        routing_queue: "customer-success",
        customer_tone: "polished and concise",
      },
    },
    {
      id: "enterprise-2",
      response:
        "Executive-ready summary: infrastructure savings are meaningful and the response clearly identifies the likely driver.",
      variables: {
        product_area: "Cost observability",
        issue_summary:
          "Finance needs a quick explanation of this month’s infrastructure savings before the board review.",
        routing_queue: "support-finance",
        customer_tone: "direct and polished",
      },
    },
    {
      id: "enterprise-3",
      response:
        "Executive-ready summary: account security improvements are explained clearly, but the next internal owner is missing.",
      variables: {
        product_area: "Account security",
        issue_summary:
          "Security team needs a concise note on the multi-factor rollout for the enterprise account review.",
        routing_queue: "support-security",
        customer_tone: "measured and confident",
      },
    },
  ],
} as const;

export default function PromptEvaluateScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { promptPath } = resolvePromptPreviewSlug(router.query.slug);
  const promptName = getWorkspaceSelectionLabel(promptPath);
  const [selectedModelId, setSelectedModelId] = useState(PREVIEW_MODELS[0]!.id);
  const [toolChips, setToolChips] = useState<string[]>([...PREVIEW_TOOL_CHIPS]);
  const [promptMessages, setPromptMessages] = useState<PromptMessage[]>(
    PREVIEW_PROMPT_MESSAGES,
  );

  if (!router.isReady || !projectId) {
    return null;
  }

  const selectedModel =
    PREVIEW_MODELS.find((model) => model.id === selectedModelId) ??
    PREVIEW_MODELS[0]!;

  const addMessage = () => {
    const nextRole =
      promptMessages.at(-1)?.role === "User" ? "Assistant" : "User";

    setPromptMessages((current) => [
      ...current,
      {
        id: `message-${current.length + 1}`,
        role: nextRole,
        content: "",
      },
    ]);
  };

  const updateMessage = (id: string, content: string) => {
    setPromptMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content } : message,
      ),
    );
  };

  const cycleMessageRole = (id: string) => {
    const roles: PromptMessageRole[] = ["System", "User", "Assistant"];

    setPromptMessages((current) =>
      current.map((message) => {
        if (message.id !== id) {
          return message;
        }

        const currentIndex = roles.indexOf(message.role);
        return {
          ...message,
          role: roles[(currentIndex + 1) % roles.length]!,
        };
      }),
    );
  };

  const appendAttachmentToken = (id: string, token: string) => {
    setPromptMessages((current) =>
      current.map((message) =>
        message.id === id
          ? {
              ...message,
              content: message.content ? `${message.content}\n${token}` : token,
            }
          : message,
      ),
    );
  };

  const removeMessage = (id: string) => {
    setPromptMessages((current) =>
      current.length > 1
        ? current.filter((message) => message.id !== id)
        : current,
    );
  };

  const addTool = (toolLabel?: string) => {
    if (toolLabel) {
      setToolChips((current) =>
        current.includes(toolLabel) ? current : [...current, toolLabel],
      );
      return;
    }

    setToolChips((current) => [...current, `tool_${current.length + 1}`]);
  };

  return (
    <PromptFrame
      projectId={projectId}
      title={promptName}
      breadcrumbs={getPromptBreadcrumbs(projectId, promptPath)}
      promptPath={promptPath}
      activeStage="evaluate"
    >
      <div className="bg-background flex min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          className="hidden h-full w-full lg:flex"
        >
          <ResizablePanel defaultSize="30%" minSize="24%">
            <PromptDraftPane
              selectedModel={selectedModel}
              toolChips={toolChips}
              messages={promptMessages}
              onSelectModel={setSelectedModelId}
              onAddTool={addTool}
              onAddMessage={addMessage}
              onCycleRole={cycleMessageRole}
              onUpdateMessage={updateMessage}
              onAddImage={(id) =>
                appendAttachmentToken(id, "[Image attachment]")
              }
              onAddFile={(id) => appendAttachmentToken(id, "[File attachment]")}
              onDeleteMessage={removeMessage}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="70%" minSize="30%">
            <PromptEvaluatePane
              promptMessages={promptMessages}
              persistenceKey={`prompt-evaluate:${projectId}:${promptPath.join("/")}`}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
        <div className="flex min-h-0 w-full flex-col divide-y lg:hidden">
          <div className="min-h-[24rem] overflow-hidden">
            <PromptDraftPane
              selectedModel={selectedModel}
              toolChips={toolChips}
              messages={promptMessages}
              onSelectModel={setSelectedModelId}
              onAddTool={addTool}
              onAddMessage={addMessage}
              onCycleRole={cycleMessageRole}
              onUpdateMessage={updateMessage}
              onAddImage={(id) =>
                appendAttachmentToken(id, "[Image attachment]")
              }
              onAddFile={(id) => appendAttachmentToken(id, "[File attachment]")}
              onDeleteMessage={removeMessage}
            />
          </div>
          <div className="min-h-[24rem] overflow-hidden">
            <PromptEvaluatePane
              promptMessages={promptMessages}
              persistenceKey={`prompt-evaluate:${projectId}:${promptPath.join("/")}`}
            />
          </div>
        </div>
      </div>
    </PromptFrame>
  );
}

function PromptEvaluatePane({
  promptMessages,
  persistenceKey,
}: {
  promptMessages: PromptMessage[];
  persistenceKey: string;
}) {
  const [evaluators, setEvaluators] = useState<EvaluatorInstance[]>([]);
  const [isAddingEvaluator, setIsAddingEvaluator] = useState(false);
  const [mode, setMode] = useState<EvaluatePaneMode>("builder");
  const [runCount, setRunCount] = useState(0);
  const [activeRun, setActiveRun] = useState<MockEvaluationRun | null>(null);
  const [hasHydratedState, setHasHydratedState] = useState(false);
  const evaluatorCategories: EvaluatorCategory[] = [
    "AI-Powered",
    "Performance",
    "Code",
  ];
  const promptTags = getPromptEvaluatorTags(promptMessages);
  const isChoosingEvaluator = evaluators.length === 0 || isAddingEvaluator;
  const canEvaluate = evaluators.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawState = window.localStorage.getItem(persistenceKey);

    if (!rawState) {
      setHasHydratedState(true);
      return;
    }

    try {
      const parsedState = JSON.parse(rawState) as PersistedEvaluateState;
      setEvaluators(parsedState.evaluators ?? []);
      setActiveRun(parsedState.activeRun ?? null);
      setMode(parsedState.mode ?? "builder");
    } catch {
      window.localStorage.removeItem(persistenceKey);
    } finally {
      setHasHydratedState(true);
    }
  }, [persistenceKey]);

  useEffect(() => {
    if (!hasHydratedState || typeof window === "undefined") {
      return;
    }

    const persistedState: PersistedEvaluateState = {
      evaluators,
      activeRun,
      mode: mode === "running" ? "results" : mode,
    };

    window.localStorage.setItem(persistenceKey, JSON.stringify(persistedState));
  }, [activeRun, evaluators, hasHydratedState, mode, persistenceKey]);

  const addEvaluatorSlot = () => {
    setIsAddingEvaluator(true);
    setMode("builder");
  };

  const selectEvaluator = (evaluatorId: EvaluatorOption["id"]) => {
    setEvaluators((current) => [
      ...current,
      createEvaluatorInstance(evaluatorId, current.length),
    ]);
    setIsAddingEvaluator(false);
    setMode("builder");
  };

  const updateEvaluator = (
    evaluatorId: string,
    patch: Partial<EvaluatorInstance>,
  ) => {
    setEvaluators((current) =>
      current.map((evaluator) =>
        evaluator.id === evaluatorId ? { ...evaluator, ...patch } : evaluator,
      ),
    );
  };

  const removeEvaluator = (evaluatorId: string) => {
    setEvaluators((current) =>
      current.filter((evaluator) => evaluator.id !== evaluatorId),
    );
  };

  const appendJudgeToken = (evaluatorId: string, token: string) => {
    setEvaluators((current) =>
      current.map((evaluator) => {
        if (evaluator.id !== evaluatorId) {
          return evaluator;
        }

        const rawToken = token === "output" ? "output" : `{{${token}}}`;
        const separator =
          evaluator.judgePrompt.length > 0 &&
          !/[\s\n]$/.test(evaluator.judgePrompt)
            ? " "
            : "";

        return {
          ...evaluator,
          judgePrompt: `${evaluator.judgePrompt}${separator}${rawToken}`,
        };
      }),
    );
  };

  const startEvaluation = () => {
    if (!canEvaluate) {
      return;
    }

    setActiveRun(buildMockEvaluationRun(evaluators));
    setRunCount((current) => current + 1);
    setIsAddingEvaluator(false);
    setMode("running");
  };

  useEffect(() => {
    if (mode !== "running" || !activeRun) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMode("results");
    }, 1400);

    return () => window.clearTimeout(timeout);
  }, [activeRun, mode, runCount]);

  if (!hasHydratedState) {
    return null;
  }

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {mode === "builder" ? "Evaluators" : "Results"}
            </p>
            <p className="text-muted-foreground text-sm">
              {mode === "builder"
                ? "Build the evaluation stack for this prompt."
                : "Latest evaluation run across the configured evaluator stack."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {mode !== "builder" ? (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 gap-2 shadow-none"
                onClick={() => setMode("builder")}
              >
                Edit evaluators
              </Button>
            ) : null}
            <Button
              size="sm"
              type="button"
              className="h-8 gap-2"
              onClick={startEvaluation}
              disabled={!canEvaluate || mode === "running"}
            >
              {mode === "running" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {mode === "running" ? "Evaluating" : "Evaluate"}
            </Button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex h-full flex-col gap-6">
          {mode === "builder" ? (
            <>
              {evaluators.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {evaluators.map((evaluator) => {
                    const option = PREVIEW_EVALUATOR_OPTIONS.find(
                      (item) => item.id === evaluator.evaluatorId,
                    );

                    if (!option) {
                      return null;
                    }

                    return (
                      <EvaluatorConfigPanel
                        key={evaluator.id}
                        evaluator={evaluator}
                        option={option}
                        promptTags={promptTags}
                        onUpdate={updateEvaluator}
                        onRemove={removeEvaluator}
                        onAppendJudgeToken={appendJudgeToken}
                      />
                    );
                  })}
                  {!isAddingEvaluator ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start gap-2 px-0 font-medium shadow-none"
                      type="button"
                      onClick={addEvaluatorSlot}
                    >
                      <CirclePlus className="size-4" />
                      Add evaluator
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {isChoosingEvaluator ? (
                <div
                  className={cn(
                    "flex flex-col gap-5",
                    evaluators.length > 0 &&
                      "border-border/70 rounded-2xl border px-4 py-4",
                  )}
                >
                  {evaluators.length > 0 ? (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium">Add evaluator</p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Choose the next evaluator to stack below the existing
                        ones.
                      </p>
                    </div>
                  ) : null}
                  {evaluatorCategories.map((category) => {
                    const options = PREVIEW_EVALUATOR_OPTIONS.filter(
                      (option) => option.category === category,
                    );

                    return (
                      <section key={category} className="flex flex-col gap-3">
                        <div className="border-b pb-2">
                          <p className="text-muted-foreground text-sm font-medium">
                            {category}
                          </p>
                        </div>
                        <div
                          role="list"
                          className={cn(
                            "grid gap-3",
                            options.length === 1
                              ? "md:grid-cols-1"
                              : "md:grid-cols-2 xl:grid-cols-3",
                          )}
                        >
                          {options.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => selectEvaluator(option.id)}
                              className="border-border/70 hover:bg-muted/40 flex min-h-24 items-start gap-3 rounded-xl border px-3.5 py-3 text-left"
                            >
                              <span
                                className={cn(
                                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                                  option.iconClass,
                                )}
                              >
                                <option.icon className="size-5" />
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-sm font-medium">
                                  {option.label}
                                </span>
                                <span className="text-muted-foreground text-sm leading-5">
                                  {option.description}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <EvaluationResultsView
              run={activeRun}
              isLoading={mode === "running"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EvaluatorConfigPanel({
  evaluator,
  option,
  promptTags,
  onUpdate,
  onRemove,
  onAppendJudgeToken,
}: {
  evaluator: EvaluatorInstance;
  option: EvaluatorOption;
  promptTags: string[];
  onUpdate: (evaluatorId: string, patch: Partial<EvaluatorInstance>) => void;
  onRemove: (evaluatorId: string) => void;
  onAppendJudgeToken: (evaluatorId: string, token: string) => void;
}) {
  return (
    <section
      className={cn("rounded-xl border px-3.5 py-3", option.tintClass)}
      aria-label={evaluator.title}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            option.iconClass,
          )}
        >
          <option.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Input
            name={`${evaluator.id}-title`}
            aria-label={`${option.label} title`}
            value={evaluator.title}
            onChange={(event) =>
              onUpdate(evaluator.id, { title: event.target.value })
            }
            className="h-6 border-0 bg-transparent px-0 py-0 text-base font-semibold shadow-none focus-visible:ring-0"
          />
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm leading-5">
            <Select
              value={evaluator.datasetId || undefined}
              onValueChange={(value) =>
                onUpdate(evaluator.id, { datasetId: value })
              }
            >
              <SelectTrigger className="h-7 w-auto max-w-[12rem] min-w-0 rounded-md border-0 bg-transparent px-0 py-0 font-semibold text-[#9e2453] shadow-none focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {PREVIEW_EVALUATION_DATASETS.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">
              {option.category} / {option.label}
            </span>
          </div>
          {evaluator.isCollapsed ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-5">
              {getEvaluatorSummary(evaluator, option)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            className="size-7 rounded-md shadow-none"
            aria-label={
              evaluator.isCollapsed ? "Expand evaluator" : "Collapse evaluator"
            }
            onClick={() =>
              onUpdate(evaluator.id, { isCollapsed: !evaluator.isCollapsed })
            }
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                evaluator.isCollapsed && "-rotate-90",
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            className="size-7 rounded-md shadow-none"
            aria-label="Remove evaluator"
            onClick={() => onRemove(evaluator.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {!evaluator.isCollapsed ? (
        <div className="pt-2.5">
          <EvaluatorConfigurationBody
            evaluator={evaluator}
            option={option}
            promptTags={promptTags}
            onUpdate={onUpdate}
            onAppendJudgeToken={onAppendJudgeToken}
          />
        </div>
      ) : null}
    </section>
  );
}

function EvaluatorConfigurationBody({
  evaluator,
  option,
  promptTags,
  onUpdate,
  onAppendJudgeToken,
}: {
  evaluator: EvaluatorInstance;
  option: EvaluatorOption;
  promptTags: string[];
  onUpdate: (evaluatorId: string, patch: Partial<EvaluatorInstance>) => void;
  onAppendJudgeToken: (evaluatorId: string, token: string) => void;
}) {
  if (option.id === "llm-judge") {
    return (
      <div className="flex flex-col gap-2">
        {promptTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="list">
            {promptTags.map((tag) => {
              const label = tag === "output" ? "output" : `{{${tag}}}`;

              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onAppendJudgeToken(evaluator.id, tag)}
                  className="border-border/70 bg-background text-muted-foreground hover:text-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium"
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
        <Textarea
          name={`${evaluator.id}-judge-prompt`}
          aria-label="LLM judge prompt"
          value={evaluator.judgePrompt}
          onChange={(event) =>
            onUpdate(evaluator.id, { judgePrompt: event.target.value })
          }
          placeholder="Enter your prompt here. You can mention columns using the variable syntax {{column_name}}. You can refer to the output of the LLM by just using the word 'output'."
          className="border-border/70 bg-background min-h-[6rem] rounded-lg px-3 py-2.5 text-sm/6 shadow-none focus-visible:ring-0"
        />
      </div>
    );
  }

  if (option.id === "cost") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>Cost is</span>
        <Select
          value={evaluator.thresholdOperator}
          onValueChange={(value: EvaluatorComparator) =>
            onUpdate(evaluator.id, { thresholdOperator: value })
          }
        >
          <SelectTrigger className="border-border/70 bg-background h-9 w-[9rem] rounded-lg px-2.5 shadow-none focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="less than">less than</SelectItem>
            <SelectItem value="greater than">greater than</SelectItem>
            <SelectItem value="equal to">equal to</SelectItem>
          </SelectContent>
        </Select>
        <Input
          name={`${evaluator.id}-cost-value`}
          aria-label="Cost threshold"
          type="number"
          inputMode="decimal"
          value={evaluator.thresholdValue}
          onChange={(event) =>
            onUpdate(evaluator.id, { thresholdValue: event.target.value })
          }
          className="border-border/70 bg-background h-9 w-[7rem] rounded-lg text-right tabular-nums shadow-none focus-visible:ring-0"
        />
        <Select
          value={evaluator.thresholdUnit}
          onValueChange={(value) =>
            onUpdate(evaluator.id, { thresholdUnit: value })
          }
        >
          <SelectTrigger className="border-border/70 bg-background h-9 w-[5.5rem] rounded-lg px-2.5 shadow-none focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (option.id === "latency" || option.id === "response-length") {
    const label = option.id === "latency" ? "Latency is" : "Response length is";
    const units =
      option.id === "latency" ? ["ms", "s"] : ["tokens", "words", "characters"];

    return (
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{label}</span>
        <Select
          value={evaluator.thresholdOperator}
          onValueChange={(value: EvaluatorComparator) =>
            onUpdate(evaluator.id, { thresholdOperator: value })
          }
        >
          <SelectTrigger className="border-border/70 bg-background h-9 w-[9rem] rounded-lg px-2.5 shadow-none focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="less than">less than</SelectItem>
            <SelectItem value="greater than">greater than</SelectItem>
            <SelectItem value="equal to">equal to</SelectItem>
          </SelectContent>
        </Select>
        <Input
          name={`${evaluator.id}-threshold-value`}
          aria-label={`${option.label} threshold`}
          type="number"
          inputMode="decimal"
          value={evaluator.thresholdValue}
          onChange={(event) =>
            onUpdate(evaluator.id, { thresholdValue: event.target.value })
          }
          className="border-border/70 bg-background h-9 w-[7rem] rounded-lg text-right tabular-nums shadow-none focus-visible:ring-0"
        />
        <Select
          value={evaluator.thresholdUnit}
          onValueChange={(value) =>
            onUpdate(evaluator.id, { thresholdUnit: value })
          }
        >
          <SelectTrigger className="border-border/70 bg-background h-9 w-[7.5rem] rounded-lg px-2.5 shadow-none focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {units.map((unit) => (
              <SelectItem key={unit} value={unit}>
                {unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (option.id === "javascript") {
    return (
      <Textarea
        name={`${evaluator.id}-code`}
        aria-label="JavaScript evaluator"
        value={evaluator.code}
        onChange={(event) =>
          onUpdate(evaluator.id, { code: event.target.value })
        }
        placeholder="Write the JavaScript evaluator here."
        className="border-border/70 bg-background min-h-[6rem] rounded-lg px-3 py-2.5 font-mono text-sm/6 shadow-none focus-visible:ring-0"
      />
    );
  }

  if (option.id === "text-matcher") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>Output</span>
        <Select
          value={evaluator.matcherOperator}
          onValueChange={(value: TextMatcherComparator) =>
            onUpdate(evaluator.id, { matcherOperator: value })
          }
        >
          <SelectTrigger className="border-border/70 bg-background h-9 w-[9rem] rounded-lg px-2.5 shadow-none focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains">contains</SelectItem>
            <SelectItem value="equals">equals</SelectItem>
            <SelectItem value="starts with">starts with</SelectItem>
          </SelectContent>
        </Select>
        <Input
          name={`${evaluator.id}-matcher-value`}
          aria-label="Text matcher value"
          value={evaluator.matcherValue}
          onChange={(event) =>
            onUpdate(evaluator.id, { matcherValue: event.target.value })
          }
          className="border-border/70 bg-background h-9 min-w-[12rem] flex-1 rounded-lg shadow-none focus-visible:ring-0"
          placeholder="expected phrase"
        />
      </div>
    );
  }

  return null;
}

function EvaluationResultsView({
  run,
  isLoading,
}: {
  run: MockEvaluationRun | null;
  isLoading: boolean;
}) {
  if (!run) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-lg font-medium">No evaluation run yet</p>
          <p className="text-muted-foreground text-sm leading-6">
            Configure at least one evaluator, then run the stack to inspect
            dataset-level results.
          </p>
        </div>
      </div>
    );
  }

  const completionLabel = isLoading ? "74% evaluated" : "100% evaluated";
  const completionDetail = isLoading
    ? "12 of 16 dataset checks are in. Remaining rows are still running across the evaluator stack."
    : `${run.total} dataset checks finished across ${run.sections.length} evaluators. Latest run captured ${run.counts.passed} passing rows.`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{run.startedAtLabel}</p>
          <p className="mt-1 text-5xl font-light tracking-tight text-lime-800/70">
            {completionLabel}
          </p>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            {completionDetail}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1.5 text-right">
          <ResultSummaryStat
            label="Passed"
            value={run.counts.passed}
            className="text-emerald-700 dark:text-emerald-300"
          />
          <ResultSummaryStat
            label="Unknown"
            value={run.counts.unknown}
            className="text-amber-700 dark:text-amber-300"
          />
          <ResultSummaryStat
            label="Failed"
            value={run.counts.failed}
            className="text-rose-700 dark:text-rose-300"
          />
          <ResultSummaryStat
            label="Total"
            value={run.total}
            className="text-muted-foreground"
          />
        </div>
      </div>

      <div className="border-border/70 bg-background overflow-hidden rounded-xl border">
        <EvaluationTrendChart run={run} isLoading={isLoading} />
      </div>

      <div className="flex flex-col gap-3">
        {run.sections.map((section) => (
          <EvaluationResultSection
            key={section.evaluatorInstanceId}
            section={section}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}

function ResultSummaryStat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 text-sm", className)}
    >
      <p>{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function EvaluationTrendChart({
  run,
  isLoading,
}: {
  run: MockEvaluationRun;
  isLoading: boolean;
}) {
  const passedSeries = buildTrendSeries(run.counts.passed, run.total, 0.82);
  const failedSeries = buildTrendSeries(run.counts.failed, run.total, 0.52);
  const unknownSeries = buildTrendSeries(run.counts.unknown, run.total, 0.24);

  return (
    <div className="from-muted/10 relative h-40 bg-linear-to-b to-transparent">
      <svg viewBox="0 0 100 40" className="size-full">
        <defs>
          <linearGradient id="passed-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(20, 184, 166, 0.22)" />
            <stop offset="100%" stopColor="rgba(20, 184, 166, 0)" />
          </linearGradient>
          <linearGradient id="failed-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(244, 63, 94, 0.18)" />
            <stop offset="100%" stopColor="rgba(244, 63, 94, 0)" />
          </linearGradient>
        </defs>
        {[10, 20, 30].map((y) => (
          <line
            key={y}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke="currentColor"
            className="text-border/60"
            strokeDasharray="1.5 2.5"
            strokeWidth="0.3"
          />
        ))}
        <path
          d={`${passedSeries.areaPath} L 100 40 L 0 40 Z`}
          fill="url(#passed-fill)"
        />
        <path
          d={`${failedSeries.areaPath} L 100 40 L 0 40 Z`}
          fill="url(#failed-fill)"
        />
        <path
          d={passedSeries.linePath}
          fill="none"
          stroke="rgb(20 184 166)"
          strokeWidth="0.55"
        />
        <path
          d={failedSeries.linePath}
          fill="none"
          stroke="rgb(244 63 94)"
          strokeWidth="0.55"
        />
        <path
          d={unknownSeries.linePath}
          fill="none"
          stroke="rgb(217 119 6)"
          strokeWidth="0.55"
        />
      </svg>
      {isLoading ? (
        <div className="bg-background/55 absolute inset-0 backdrop-blur-[1px]">
          <div className="flex h-full items-center justify-center">
            <div className="border-border/70 bg-background/85 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium">
              <LoaderCircle className="size-4 animate-spin" />
              Running evaluator stack
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EvaluationResultSection({
  section,
  isLoading,
}: {
  section: MockEvaluationSection;
  isLoading: boolean;
}) {
  return (
    <section className="border-border/70 bg-background overflow-hidden rounded-xl border">
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {section.evaluatorTitle}
            </p>
            <p className="text-muted-foreground text-sm">
              {section.evaluatorSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <p className="text-emerald-700 dark:text-emerald-300">
              Passed{" "}
              <span className="tabular-nums">{section.counts.passed}</span>
            </p>
            <p className="text-rose-700 dark:text-rose-300">
              Failed{" "}
              <span className="tabular-nums">{section.counts.failed}</span>
            </p>
            <p className="text-amber-700 dark:text-amber-300">
              Unknown{" "}
              <span className="tabular-nums">{section.counts.unknown}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed">
          <thead className="bg-muted/20">
            <tr className="text-left">
              <th className="text-muted-foreground w-32 px-4 py-2 text-xs font-medium tracking-[0.08em] uppercase">
                Status
              </th>
              <th className="text-muted-foreground w-56 px-4 py-2 text-xs font-medium tracking-[0.08em] uppercase">
                Reason
              </th>
              <th className="text-muted-foreground px-4 py-2 text-xs font-medium tracking-[0.08em] uppercase">
                Response
              </th>
              <th className="text-muted-foreground w-64 px-4 py-2 text-xs font-medium tracking-[0.08em] uppercase">
                Variables
              </th>
            </tr>
          </thead>
          <tbody>
            {(isLoading ? section.rows.slice(0, 4) : section.rows).map(
              (row) => (
                <tr
                  key={row.id}
                  className="border-border/70 border-t align-top"
                >
                  <td className="px-4 py-3">
                    {isLoading ? (
                      <LoadingCell className="h-5 w-20" />
                    ) : (
                      <ResultStatusLabel status={row.status} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isLoading ? (
                      <LoadingStack />
                    ) : (
                      <p className="text-sm leading-6">{row.reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isLoading ? (
                      <LoadingStack />
                    ) : (
                      <p className="text-sm leading-6">{row.response}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isLoading ? (
                      <LoadingStack compact />
                    ) : (
                      <div className="flex flex-col gap-2">
                        {row.variables.map((variable) => (
                          <div key={variable.key}>
                            <p className="text-[11px] font-medium tracking-[0.08em] text-fuchsia-700 uppercase dark:text-fuchsia-300">
                              {variable.key}
                            </p>
                            <p className="text-muted-foreground text-sm leading-5">
                              {variable.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultStatusLabel({ status }: { status: MockEvaluationStatus }) {
  if (status === "passed") {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-4" />
        <p>Passed</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-rose-700 dark:text-rose-300">
        <XCircle className="size-4" />
        <p>Failed</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
      <MinusCircle className="size-4" />
      <p>Unknown</p>
    </div>
  );
}

function LoadingCell({ className }: { className?: string }) {
  return <div className={cn("bg-muted animate-pulse rounded", className)} />;
}

function LoadingStack({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <LoadingCell
        className={cn("h-4 w-full", compact ? "max-w-[11rem]" : "")}
      />
      <LoadingCell className={cn("h-4 w-5/6", compact ? "max-w-[9rem]" : "")} />
      {!compact ? <LoadingCell className="h-4 w-2/3" /> : null}
    </div>
  );
}

function createEvaluatorInstance(
  evaluatorId: EvaluatorOption["id"],
  index: number,
): EvaluatorInstance {
  if (evaluatorId === "cost") {
    return {
      id: `evaluator-${index + 1}`,
      evaluatorId,
      title: "Untitled",
      datasetId: "",
      isCollapsed: false,
      judgePrompt: "",
      thresholdOperator: "less than",
      thresholdValue: "0",
      thresholdUnit: "USD",
      code: "",
      matcherOperator: "contains",
      matcherValue: "",
    };
  }

  if (evaluatorId === "latency") {
    return {
      id: `evaluator-${index + 1}`,
      evaluatorId,
      title: "Untitled",
      datasetId: "",
      isCollapsed: false,
      judgePrompt: "",
      thresholdOperator: "less than",
      thresholdValue: "1200",
      thresholdUnit: "ms",
      code: "",
      matcherOperator: "contains",
      matcherValue: "",
    };
  }

  if (evaluatorId === "response-length") {
    return {
      id: `evaluator-${index + 1}`,
      evaluatorId,
      title: "Untitled",
      datasetId: "",
      isCollapsed: false,
      judgePrompt: "",
      thresholdOperator: "less than",
      thresholdValue: "250",
      thresholdUnit: "tokens",
      code: "",
      matcherOperator: "contains",
      matcherValue: "",
    };
  }

  if (evaluatorId === "javascript") {
    return {
      id: `evaluator-${index + 1}`,
      evaluatorId,
      title: "Untitled",
      datasetId: "",
      isCollapsed: false,
      judgePrompt: "",
      thresholdOperator: "less than",
      thresholdValue: "0",
      thresholdUnit: "USD",
      code: 'return output.includes("escalate") ? 1 : 0;',
      matcherOperator: "contains",
      matcherValue: "",
    };
  }

  if (evaluatorId === "text-matcher") {
    return {
      id: `evaluator-${index + 1}`,
      evaluatorId,
      title: "Untitled",
      datasetId: "",
      isCollapsed: false,
      judgePrompt: "",
      thresholdOperator: "less than",
      thresholdValue: "0",
      thresholdUnit: "USD",
      code: "",
      matcherOperator: "contains",
      matcherValue: "",
    };
  }

  return {
    id: `evaluator-${index + 1}`,
    evaluatorId,
    title: "Untitled",
    datasetId: "",
    isCollapsed: false,
    judgePrompt: "",
    thresholdOperator: "less than",
    thresholdValue: "0",
    thresholdUnit: "USD",
    code: "",
    matcherOperator: "contains",
    matcherValue: "",
  };
}

function getPromptEvaluatorTags(promptMessages: PromptMessage[]) {
  return Array.from(
    new Set([
      ...promptMessages.flatMap((message) => extractVariables(message.content)),
      "output",
    ]),
  );
}

function getEvaluatorSummary(
  evaluator: EvaluatorInstance,
  option: EvaluatorOption,
) {
  if (option.id === "llm-judge") {
    return (
      evaluator.judgePrompt || "Add the instruction prompt for this judge."
    );
  }

  if (
    option.id === "cost" ||
    option.id === "latency" ||
    option.id === "response-length"
  ) {
    return `${evaluator.thresholdOperator} ${evaluator.thresholdValue || "0"} ${evaluator.thresholdUnit}`;
  }

  if (option.id === "javascript") {
    return evaluator.code || "Write a JavaScript evaluator.";
  }

  if (option.id === "text-matcher") {
    return `${evaluator.matcherOperator} ${evaluator.matcherValue || "expected phrase"}`;
  }

  return option.description;
}

function buildMockEvaluationRun(
  evaluators: EvaluatorInstance[],
): MockEvaluationRun {
  const sections = evaluators.map((evaluator) => {
    const option = PREVIEW_EVALUATOR_OPTIONS.find(
      (item) => item.id === evaluator.evaluatorId,
    );
    const datasetCases = getMockDatasetCases(evaluator.datasetId);
    const rows = datasetCases.map((datasetCase, index) =>
      buildMockEvaluationRow(evaluator, datasetCase, index),
    );
    const counts = rows.reduce<Record<MockEvaluationStatus, number>>(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { passed: 0, failed: 0, unknown: 0 },
    );

    return {
      evaluatorInstanceId: evaluator.id,
      evaluatorTitle: evaluator.title || "Untitled",
      evaluatorSubtitle: option
        ? `${getDatasetLabel(evaluator.datasetId)} • ${option.category} / ${option.label}`
        : "Evaluator",
      counts,
      rows,
    };
  });

  const counts = sections.reduce<Record<MockEvaluationStatus, number>>(
    (acc, section) => {
      acc.passed += section.counts.passed;
      acc.failed += section.counts.failed;
      acc.unknown += section.counts.unknown;
      return acc;
    },
    { passed: 0, failed: 0, unknown: 0 },
  );

  return {
    id: `run-${Date.now()}`,
    startedAtLabel: "just now",
    counts,
    total: counts.passed + counts.failed + counts.unknown,
    sections,
  };
}

function getMockDatasetCases(datasetId: string) {
  return (
    MOCK_EVALUATION_DATASETS[
      (datasetId as keyof typeof MOCK_EVALUATION_DATASETS) || "dataset-support"
    ] ?? MOCK_EVALUATION_DATASETS["dataset-support"]
  );
}

function getDatasetLabel(datasetId: string) {
  return (
    PREVIEW_EVALUATION_DATASETS.find((dataset) => dataset.id === datasetId)
      ?.label ?? "Support inbox"
  );
}

function buildMockEvaluationRow(
  evaluator: EvaluatorInstance,
  datasetCase: (typeof MOCK_EVALUATION_DATASETS)[keyof typeof MOCK_EVALUATION_DATASETS][number],
  index: number,
): MockEvaluationRow {
  if (evaluator.evaluatorId === "cost") {
    const values = [0.0003, 0.0003, 0.0004, 0.0002];
    const observed = values[index % values.length] ?? 0.0003;
    const expected = Number(evaluator.thresholdValue || "0");
    const status = compareObservedValue(
      observed,
      expected,
      evaluator.thresholdOperator,
    )
      ? "passed"
      : "failed";

    return {
      id: `${evaluator.id}-${datasetCase.id}`,
      status,
      reason: `Response cost is $${observed.toFixed(4)} which is ${getComparatorPhrase(
        observed,
        expected,
        evaluator.thresholdOperator,
      )} the required value of $${expected.toFixed(4)}.`,
      response: datasetCase.response,
      variables: formatVariables(datasetCase.variables),
    };
  }

  if (evaluator.evaluatorId === "latency") {
    const values = [820, 1080, 1450, 910];
    const observed = values[index % values.length] ?? 820;
    const expected = Number(evaluator.thresholdValue || "0");
    const status = compareObservedValue(
      observed,
      expected,
      evaluator.thresholdOperator,
    )
      ? "passed"
      : "failed";

    return {
      id: `${evaluator.id}-${datasetCase.id}`,
      status,
      reason: `Full response latency was ${observed} ${evaluator.thresholdUnit}, which is ${getComparatorPhrase(
        observed,
        expected,
        evaluator.thresholdOperator,
      )} the target threshold.`,
      response: datasetCase.response,
      variables: formatVariables(datasetCase.variables),
    };
  }

  if (evaluator.evaluatorId === "response-length") {
    const values = [172, 238, 284, 194];
    const observed = values[index % values.length] ?? 172;
    const expected = Number(evaluator.thresholdValue || "0");
    const status = compareObservedValue(
      observed,
      expected,
      evaluator.thresholdOperator,
    )
      ? "passed"
      : "failed";

    return {
      id: `${evaluator.id}-${datasetCase.id}`,
      status,
      reason: `Response length was ${observed} ${evaluator.thresholdUnit}, which is ${getComparatorPhrase(
        observed,
        expected,
        evaluator.thresholdOperator,
      )} the configured requirement.`,
      response: datasetCase.response,
      variables: formatVariables(datasetCase.variables),
    };
  }

  if (evaluator.evaluatorId === "javascript") {
    const outputs = [1, 1, 0, 1];
    const observed = outputs[index % outputs.length] ?? 1;
    const status: MockEvaluationStatus = observed === 1 ? "passed" : "failed";

    return {
      id: `${evaluator.id}-${datasetCase.id}`,
      status,
      reason:
        observed === 1
          ? "JavaScript evaluator returned a passing signal for this response."
          : "JavaScript evaluator returned 0, so this response failed the custom check.",
      response: datasetCase.response,
      variables: formatVariables(datasetCase.variables),
    };
  }

  if (evaluator.evaluatorId === "text-matcher") {
    const matcher = evaluator.matcherValue.trim().toLowerCase();
    const haystack = datasetCase.response.toLowerCase();
    const matched =
      matcher.length === 0
        ? false
        : evaluator.matcherOperator === "equals"
          ? haystack === matcher
          : evaluator.matcherOperator === "starts with"
            ? haystack.startsWith(matcher)
            : haystack.includes(matcher);
    const status: MockEvaluationStatus =
      matcher.length === 0 ? "unknown" : matched ? "passed" : "failed";

    return {
      id: `${evaluator.id}-${datasetCase.id}`,
      status,
      reason:
        status === "unknown"
          ? "No matcher phrase was configured for this evaluator."
          : matched
            ? `Response ${evaluator.matcherOperator} "${evaluator.matcherValue}".`
            : `Response does not ${evaluator.matcherOperator} "${evaluator.matcherValue}".`,
      response: datasetCase.response,
      variables: formatVariables(datasetCase.variables),
    };
  }

  const judgeOutcomes: MockEvaluationStatus[] = [
    "passed",
    "passed",
    "failed",
    "unknown",
  ];
  const status = judgeOutcomes[index % judgeOutcomes.length] ?? "passed";
  const promptIntent =
    evaluator.judgePrompt.trim().slice(0, 72) || "the configured judge prompt";
  const reasonByStatus = {
    passed: `Judge agreed that the response satisfies ${promptIntent}.`,
    failed: `Judge found the response incomplete for ${promptIntent}.`,
    unknown:
      "Judge could not reach a confident verdict because the criteria were underspecified.",
  } as const;

  return {
    id: `${evaluator.id}-${datasetCase.id}`,
    status,
    reason: reasonByStatus[status],
    response: datasetCase.response,
    variables: formatVariables(datasetCase.variables),
  };
}

function formatVariables(variables: Record<string, string>) {
  return Object.entries(variables).map(([key, value]) => ({
    key: key.toUpperCase(),
    value,
  }));
}

function compareObservedValue(
  observed: number,
  expected: number,
  comparator: EvaluatorComparator,
) {
  if (comparator === "greater than") {
    return observed > expected;
  }

  if (comparator === "equal to") {
    return observed === expected;
  }

  return observed < expected;
}

function getComparatorPhrase(
  observed: number,
  expected: number,
  comparator: EvaluatorComparator,
) {
  if (comparator === "greater than") {
    return observed > expected ? "greater than" : "not greater than";
  }

  if (comparator === "equal to") {
    return observed === expected ? "equal to" : "not equal to";
  }

  return observed < expected ? "less than" : "not less than";
}

function buildTrendSeries(totalForStatus: number, total: number, bias: number) {
  const ratio = total === 0 ? 0 : totalForStatus / total;
  const points = [
    { x: 0, y: 28 - ratio * 9 },
    { x: 36, y: 27 - ratio * 8.2 },
    { x: 74, y: 26 - ratio * 7.5 - bias * 2 },
    { x: 100, y: 39.5 },
  ];

  return {
    linePath: points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x} ${point.y.toFixed(2)}`,
      )
      .join(" "),
    areaPath: points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x} ${point.y.toFixed(2)}`,
      )
      .join(" "),
  };
}
