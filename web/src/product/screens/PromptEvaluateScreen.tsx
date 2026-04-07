import { useRouter } from "next/router";
import { useState } from "react";
import { extractVariables } from "@langfuse/shared";
import {
  Bot,
  ChevronDown,
  Braces,
  CirclePlus,
  Coins,
  Search,
  Timer,
  Trash2,
  Type,
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
            <PromptEvaluatePane promptMessages={promptMessages} />
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
            <PromptEvaluatePane promptMessages={promptMessages} />
          </div>
        </div>
      </div>
    </PromptFrame>
  );
}

function PromptEvaluatePane({
  promptMessages,
}: {
  promptMessages: PromptMessage[];
}) {
  const [evaluators, setEvaluators] = useState<EvaluatorInstance[]>([]);
  const [isAddingEvaluator, setIsAddingEvaluator] = useState(false);
  const evaluatorCategories: EvaluatorCategory[] = [
    "AI-Powered",
    "Performance",
    "Code",
  ];
  const promptTags = getPromptEvaluatorTags(promptMessages);
  const isChoosingEvaluator = evaluators.length === 0 || isAddingEvaluator;

  const addEvaluatorSlot = () => {
    setIsAddingEvaluator(true);
  };

  const selectEvaluator = (evaluatorId: EvaluatorOption["id"]) => {
    setEvaluators((current) => [
      ...current,
      createEvaluatorInstance(evaluatorId, current.length),
    ]);
    setIsAddingEvaluator(false);
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

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Evaluators</p>
        <p className="text-muted-foreground text-sm">
          Build the evaluation stack for this prompt.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex h-full flex-col gap-6">
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
                    Choose the next evaluator to stack below the existing ones.
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
