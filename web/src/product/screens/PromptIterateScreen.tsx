import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { extractVariables } from "@langfuse/shared";
import {
  Check,
  Brackets,
  ChevronDown,
  CircleMinus,
  CirclePlus,
  Cpu,
  FilePlus,
  ImagePlus,
  Play,
  SquareFunction,
  Terminal,
  Variable,
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import { PromptFrame } from "../frames/PromptFrame";
import {
  getPromptBreadcrumbs,
  getWorkspaceSelectionLabel,
  resolvePromptPreviewSlug,
} from "../shell/product-manifest";

type PromptMessageRole = "System" | "User" | "Assistant";

type PromptMessage = {
  id: string;
  role: PromptMessageRole;
  content: string;
};

type PreviewModel = {
  id: string;
  label: string;
  provider: string;
  providerLabel: string;
  providerIcon: string;
  description: string;
  artificialAnalysisUrl: string;
  benchmarks: {
    intelligence: string;
    speed: string;
    latency: string;
    blendedPrice: string;
    intelligenceValue: number;
    speedValue: number;
    latencyValue: number;
    blendedPriceValue: number;
  };
};

const PREVIEW_MODELS: PreviewModel[] = [
  {
    id: "openai::gpt-4.1-mini",
    label: "openai::gpt-4.1-mini",
    provider: "openai",
    providerLabel: "OpenAI",
    providerIcon: "/providers/openai/light.svg",
    description:
      "Balanced small model for rapid prompt iteration, short test loops, and lightweight classification runs.",
    artificialAnalysisUrl: "https://artificialanalysis.ai/models/gpt-4-1-mini",
    benchmarks: {
      intelligence: "23",
      speed: "74.4 t/s",
      latency: "0.78s TTFT",
      blendedPrice: "$0.70 / 1M",
      intelligenceValue: 23,
      speedValue: 74.4,
      latencyValue: 0.78,
      blendedPriceValue: 0.7,
    },
  },
  {
    id: "openai::gpt-4.1",
    label: "openai::gpt-4.1",
    provider: "openai",
    providerLabel: "OpenAI",
    providerIcon: "/providers/openai/light.svg",
    description:
      "Stronger reasoning model for prompt authoring when you want higher quality output and longer context windows.",
    artificialAnalysisUrl: "https://artificialanalysis.ai/models/gpt-4-1",
    benchmarks: {
      intelligence: "26",
      speed: "86.9 t/s",
      latency: "1.06s TTFT",
      blendedPrice: "$3.50 / 1M",
      intelligenceValue: 26,
      speedValue: 86.9,
      latencyValue: 1.06,
      blendedPriceValue: 3.5,
    },
  },
  {
    id: "anthropic::claude-sonnet-4",
    label: "anthropic::claude-sonnet-4",
    provider: "anthropic",
    providerLabel: "Anthropic",
    providerIcon: "/providers/anthropic/light.svg",
    description:
      "High quality drafting model with strong instruction following and reliable long-form synthesis.",
    artificialAnalysisUrl:
      "https://artificialanalysis.ai/models/claude-4-sonnet",
    benchmarks: {
      intelligence: "33",
      speed: "41.8 t/s",
      latency: "1.39s TTFT",
      blendedPrice: "$6.00 / 1M",
      intelligenceValue: 33,
      speedValue: 41.8,
      latencyValue: 1.39,
      blendedPriceValue: 6,
    },
  },
  {
    id: "anthropic::claude-haiku-4-5",
    label: "anthropic::claude-haiku-4-5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    providerIcon: "/providers/anthropic/light.svg",
    description:
      "Fast and inexpensive variant for high-volume preview runs and smaller routing tasks.",
    artificialAnalysisUrl:
      "https://artificialanalysis.ai/models/claude-4-5-haiku",
    benchmarks: {
      intelligence: "31",
      speed: "88.4 t/s",
      latency: "0.74s TTFT",
      blendedPrice: "$2.00 / 1M",
      intelligenceValue: 31,
      speedValue: 88.4,
      latencyValue: 0.74,
      blendedPriceValue: 2,
    },
  },
];

const PREVIEW_MODEL_GROUPS = Object.entries(
  PREVIEW_MODELS.reduce<Record<string, PreviewModel[]>>((groups, model) => {
    groups[model.providerLabel] ??= [];
    groups[model.providerLabel]!.push(model);
    return groups;
  }, {}),
);

const PREVIEW_TOOL_LIBRARY = [
  "issue_classifier",
  "kb_lookup",
  "refund_policy",
  "priority_router",
] as const;

const PREVIEW_TOOL_CHIPS = PREVIEW_TOOL_LIBRARY.slice(0, 2);

const PREVIEW_PROMPT_MESSAGES: PromptMessage[] = [
  {
    id: "message-system",
    role: "System",
    content:
      "You are a support triage assistant for {{product_area}}. Review {{issue_summary}} and prepare a concise handoff for the {{routing_queue}} queue.",
  },
  {
    id: "message-user",
    role: "User",
    content:
      "Respond in a {{customer_tone}} tone, call out the likely root cause, and propose the next internal action without promising a resolution date.",
  },
] as const;

const PREVIEW_VARIABLES = [
  {
    key: "product_area",
    label: "product_area",
    value: "Observability exports",
    type: "Text",
    description:
      "Anchors the prompt to the product surface the support team should reason about.",
    usage:
      "Used in the system prompt so routing and language stay aligned with the affected product area.",
  },
  {
    key: "issue_summary",
    label: "issue_summary",
    value:
      "Customer cannot export filtered traces to CSV when a session filter is active.",
    type: "Text",
    description:
      "Supplies the live incident summary that the prompt should classify and rewrite.",
    usage:
      "Injected into both the system and user messages so the draft and playground run use the same case data.",
  },
  {
    key: "routing_queue",
    label: "routing_queue",
    value: "support-escalations",
    type: "Text",
    description:
      "Keeps the prompt explicit about where the issue should be routed when it qualifies for escalation.",
    usage:
      "Referenced in the prompt draft and echoed back in the playground response preview.",
  },
  {
    key: "customer_tone",
    label: "customer_tone",
    value: "calm and direct",
    type: "Text",
    description:
      "Controls the tone of the response without forcing prompt authors to duplicate copy variants.",
    usage:
      "Applied in the user message and shown here as the most direct knob for quick iteration.",
  },
] as const;

export default function PromptIterateScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { promptPath } = resolvePromptPreviewSlug(router.query.slug);
  const promptName = getWorkspaceSelectionLabel(promptPath);
  const [selectedModelId, setSelectedModelId] = useState(PREVIEW_MODELS[0]!.id);
  const [toolChips, setToolChips] = useState<
    (typeof PREVIEW_TOOL_LIBRARY)[number][]
  >([...PREVIEW_TOOL_CHIPS]);
  const [promptMessages, setPromptMessages] = useState<PromptMessage[]>(
    PREVIEW_PROMPT_MESSAGES,
  );
  const [selectedVariable, setSelectedVariable] = useState<string>(
    PREVIEW_VARIABLES[0]?.key ?? "",
  );
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        PREVIEW_VARIABLES.map((variable) => [variable.key, variable.value]),
      ),
  );

  if (!router.isReady || !projectId) {
    return null;
  }

  const selectedVariableData =
    PREVIEW_VARIABLES.find((variable) => variable.key === selectedVariable) ??
    PREVIEW_VARIABLES[0];

  if (!selectedVariableData) {
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

  const addTool = () => {
    const nextTool = PREVIEW_TOOL_LIBRARY.find(
      (tool) => !toolChips.includes(tool),
    );

    if (!nextTool) {
      setToolChips([...PREVIEW_TOOL_CHIPS]);
      return;
    }

    setToolChips((current) => [...current, nextTool]);
  };

  return (
    <PromptFrame
      projectId={projectId}
      title={promptName}
      breadcrumbs={getPromptBreadcrumbs(projectId, promptPath)}
      promptPath={promptPath}
      activeStage="iterate"
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
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="56%" minSize="28%">
                <PlaygroundPreviewPane
                  projectId={projectId}
                  messages={promptMessages}
                  variableValues={variableValues}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="44%" minSize="24%">
                <VariablesPane
                  selectedVariable={selectedVariableData.key}
                  selectedVariableValue={
                    variableValues[selectedVariableData.key] ?? ""
                  }
                  variableValues={variableValues}
                  onSelectVariable={setSelectedVariable}
                  onValueChange={(value) =>
                    setVariableValues((current) => ({
                      ...current,
                      [selectedVariableData.key]: value,
                    }))
                  }
                />
              </ResizablePanel>
            </ResizablePanelGroup>
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
            <PlaygroundPreviewPane
              projectId={projectId}
              messages={promptMessages}
              variableValues={variableValues}
            />
          </div>
          <div className="min-h-[24rem] overflow-hidden">
            <VariablesPane
              selectedVariable={selectedVariableData.key}
              selectedVariableValue={
                variableValues[selectedVariableData.key] ?? ""
              }
              variableValues={variableValues}
              onSelectVariable={setSelectedVariable}
              onValueChange={(value) =>
                setVariableValues((current) => ({
                  ...current,
                  [selectedVariableData.key]: value,
                }))
              }
              stackOnMobile
            />
          </div>
        </div>
      </div>
    </PromptFrame>
  );
}

function PromptDraftPane({
  selectedModel,
  toolChips,
  messages,
  onSelectModel,
  onAddTool,
  onAddMessage,
  onCycleRole,
  onUpdateMessage,
  onAddImage,
  onAddFile,
  onDeleteMessage,
}: {
  selectedModel: PreviewModel;
  toolChips: readonly string[];
  messages: PromptMessage[];
  onSelectModel: (value: string) => void;
  onAddTool: () => void;
  onAddMessage: () => void;
  onCycleRole: (id: string) => void;
  onUpdateMessage: (id: string, content: string) => void;
  onAddImage: (id: string) => void;
  onAddFile: (id: string) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [highlightedModelId, setHighlightedModelId] = useState(
    selectedModel.id,
  );

  const highlightedModel =
    PREVIEW_MODELS.find((model) => model.id === highlightedModelId) ??
    selectedModel;

  return (
    <div className="group/editor flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto px-3.5 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Popover
            open={modelPopoverOpen}
            onOpenChange={(open) => {
              setModelPopoverOpen(open);
              if (open) {
                setHighlightedModelId(selectedModel.id);
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="bg-muted/40 border-border/70 relative h-7 justify-start pr-2 pl-8 shadow-none [&>svg]:absolute [&>svg]:left-2.5 [&>svg]:size-3"
                type="button"
              >
                <Cpu className="size-3" />
                {selectedModel.label}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={6}
              className="z-50 w-[min(760px,calc(100vw-2rem))] border-0 bg-transparent p-0 shadow-none"
            >
              <div className="bg-background grid overflow-hidden rounded-lg border shadow-sm md:grid-cols-[300px_minmax(0,1fr)]">
                <div className="min-w-0 border-b md:border-r md:border-b-0">
                  <Command>
                    <div className="border-b px-1.5">
                      <CommandInput
                        placeholder="Search models..."
                        aria-label="Search models"
                        showBorder={false}
                        className="h-9"
                      />
                    </div>
                    <CommandList className="max-h-[400px] overflow-y-auto px-2 py-2">
                      <CommandEmpty>No model found.</CommandEmpty>
                      {PREVIEW_MODEL_GROUPS.map(([providerLabel, models]) => (
                        <CommandGroup
                          key={providerLabel}
                          heading={providerLabel}
                          className="px-0"
                        >
                          {models.map((model) => (
                            <CommandItem
                              key={model.id}
                              value={`${model.providerLabel} ${model.label}`}
                              onSelect={() => {
                                onSelectModel(model.id);
                                setHighlightedModelId(model.id);
                                setModelPopoverOpen(false);
                              }}
                              onMouseEnter={() =>
                                setHighlightedModelId(model.id)
                              }
                              onFocus={() => setHighlightedModelId(model.id)}
                              className="data-[selected=true]:bg-muted/70 gap-2 rounded-md px-2.5 py-2 text-sm"
                            >
                              <div className="mr-[-3px] flex size-4 items-center justify-center">
                                <Image
                                  width="14"
                                  height="14"
                                  className="size-3.5"
                                  src={model.providerIcon}
                                  alt={`${model.providerLabel} icon`}
                                />
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-medium">
                                  {model.label}
                                </span>
                                <span className="text-muted-foreground truncate text-[11px]">
                                  {model.benchmarks.speed} ·{" "}
                                  {model.benchmarks.blendedPrice}
                                </span>
                              </div>
                              <Check
                                className={cn(
                                  "size-3.5",
                                  model.id === selectedModel.id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                      <CommandSeparator className="my-1" />
                      <CommandGroup className="px-0">
                        <CommandItem
                          value="add provider"
                          className="gap-2 rounded-md px-2.5 py-2 text-sm"
                        >
                          <span className="flex size-4 items-center justify-center">
                            <CirclePlus className="size-3.5" />
                          </span>
                          <span>Add provider</span>
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>
                <div className="min-w-0">
                  <div className="flex h-full flex-col">
                    <div className="border-b px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-muted-foreground flex items-center gap-1 text-xs">
                            <div className="mr-[-3px] flex size-4 items-center justify-center">
                              <Image
                                width="14"
                                height="14"
                                className="size-3.5"
                                src={highlightedModel.providerIcon}
                                alt={`${highlightedModel.providerLabel} icon`}
                              />
                            </div>
                            <span>{highlightedModel.providerLabel}</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-medium">
                            {highlightedModel.label}
                          </p>
                        </div>
                        {highlightedModel.id === selectedModel.id ? (
                          <span className="text-muted-foreground shrink-0 text-[11px]">
                            Selected
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 px-4 py-3">
                      <p className="text-muted-foreground text-sm leading-6">
                        {highlightedModel.description}
                      </p>
                      <div className="overflow-hidden rounded-md border">
                        <div className="grid grid-cols-2">
                          <BenchmarkCard
                            label="Intelligence"
                            value={highlightedModel.benchmarks.intelligence}
                            numericValue={
                              highlightedModel.benchmarks.intelligenceValue
                            }
                            numericRange={getBenchmarkRange(
                              "intelligenceValue",
                            )}
                            hint={getBenchmarkHint(
                              highlightedModel,
                              "intelligenceValue",
                            )}
                            className="border-r border-b"
                          />
                          <BenchmarkCard
                            label="Speed"
                            value={highlightedModel.benchmarks.speed}
                            numericValue={
                              highlightedModel.benchmarks.speedValue
                            }
                            numericRange={getBenchmarkRange("speedValue")}
                            hint={getBenchmarkHint(
                              highlightedModel,
                              "speedValue",
                            )}
                            className="border-b"
                          />
                          <BenchmarkCard
                            label="Latency"
                            value={highlightedModel.benchmarks.latency}
                            numericValue={
                              highlightedModel.benchmarks.latencyValue
                            }
                            numericRange={getBenchmarkRange("latencyValue")}
                            hint={getBenchmarkHint(
                              highlightedModel,
                              "latencyValue",
                              true,
                            )}
                            className="border-r"
                            inverse
                          />
                          <BenchmarkCard
                            label="Blended price"
                            value={highlightedModel.benchmarks.blendedPrice}
                            numericValue={
                              highlightedModel.benchmarks.blendedPriceValue
                            }
                            numericRange={getBenchmarkRange(
                              "blendedPriceValue",
                            )}
                            hint={getBenchmarkHint(
                              highlightedModel,
                              "blendedPriceValue",
                              true,
                            )}
                            inverse
                          />
                        </div>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
                        <p className="text-muted-foreground text-[11px] leading-5">
                          Data from{" "}
                          <Link
                            href={highlightedModel.artificialAnalysisUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground underline underline-offset-2"
                          >
                            Artificial Analysis
                          </Link>
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            highlightedModel.id === selectedModel.id
                              ? "outline"
                              : "default"
                          }
                          className="h-8 shrink-0 px-3"
                          disabled={highlightedModel.id === selectedModel.id}
                          onClick={() => {
                            onSelectModel(highlightedModel.id);
                            setModelPopoverOpen(false);
                          }}
                        >
                          {highlightedModel.id === selectedModel.id
                            ? "Selected"
                            : "Use model"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {toolChips.map((tool) => (
            <Button
              key={tool}
              variant="outline"
              size="sm"
              className="border-border/70 h-6 shrink-0 gap-1 rounded-md px-2 font-medium shadow-none"
              type="button"
            >
              <SquareFunction className="size-3" />
              <span className="truncate">{tool}</span>
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="-ml-1.5 h-6 shrink-0 gap-1 px-2"
            type="button"
            title="Add tool"
            onClick={onAddTool}
          >
            <CirclePlus className="size-3.5" />
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </div>
      </div>
      <div
        role="list"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
      >
        {messages.map((message) => (
          <PromptEditorMessageRow
            key={message.id}
            id={message.id}
            role={message.role}
            content={message.content}
            onCycleRole={onCycleRole}
            onUpdateMessage={onUpdateMessage}
            onAddImage={onAddImage}
            onAddFile={onAddFile}
            onDeleteMessage={onDeleteMessage}
          />
        ))}
      </div>
      <div className="flex items-center justify-start px-2 pb-3 opacity-0 transition-opacity group-hover/editor:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 font-medium"
          type="button"
          onClick={onAddMessage}
        >
          Add Message
        </Button>
      </div>
    </div>
  );
}

function PlaygroundPreviewPane({
  projectId,
  messages,
  variableValues,
}: {
  projectId: string;
  messages: PromptMessage[];
  variableValues: Record<string, string>;
}) {
  return (
    <div className="bg-background flex h-full flex-col overflow-hidden">
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="56%" minSize="32%">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Preview</Badge>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/project/${projectId}/playground`}>
                    <Terminal className="size-4" />
                    Open live
                  </Link>
                </Button>
              </div>
              <div className="inline-flex">
                <Button size="sm" className="rounded-r-none">
                  <Play className="size-4" />
                  Run
                </Button>
                <Button size="icon-sm" className="rounded-l-none border-l">
                  <ChevronDown className="size-3" />
                </Button>
              </div>
            </div>
            <div className="bg-muted/15 min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div role="list" className="divide-y">
                {messages.map((message) => (
                  <PlaygroundSummaryRow
                    key={message.id}
                    role={message.role}
                    content={interpolateMessage(
                      message.content,
                      variableValues,
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="44%" minSize="22%">
          <div className="bg-muted/10 flex h-full items-center justify-center border-t px-6 text-center">
            <div className="flex max-w-sm flex-col gap-1">
              <p className="text-sm font-medium">
                Press Run to test the prompt
              </p>
              <p className="text-muted-foreground text-base/7 sm:text-sm/6">
                Output stays empty until the draft is executed.
              </p>
              <p className="text-muted-foreground text-base/7 sm:text-sm/6">
                Current queue:{" "}
                <strong className="font-semibold">
                  {variableValues.routing_queue}
                </strong>
              </p>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function VariablesPane({
  selectedVariable,
  selectedVariableValue,
  variableValues,
  onSelectVariable,
  onValueChange,
  stackOnMobile = false,
}: {
  selectedVariable: string;
  selectedVariableValue: string;
  variableValues: Record<string, string>;
  onSelectVariable: (value: string) => void;
  onValueChange: (value: string) => void;
  stackOnMobile?: boolean;
}) {
  const selectedVariableMeta =
    PREVIEW_VARIABLES.find((variable) => variable.key === selectedVariable) ??
    PREVIEW_VARIABLES[0];

  if (!selectedVariableMeta) {
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Variable className="size-4" />
            <p className="text-sm font-medium">
              {PREVIEW_VARIABLES.length} variables
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 font-medium">
            <CirclePlus className="size-3.5" />
            Link dataset
          </Button>
        </div>
      </div>
      <div className="border-b px-2 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {PREVIEW_VARIABLES.map((variable) => (
            <button
              key={variable.key}
              className={cn(
                "flex shrink-0 flex-col items-start rounded-md px-2 py-1 text-left",
                variable.key === selectedVariable
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted/60 text-muted-foreground",
              )}
              onClick={() => onSelectVariable(variable.key)}
            >
              <span className="text-sm font-medium">{variable.label}</span>
              <span className="truncate text-xs">
                {variableValues[variable.key] ?? ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      {stackOnMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <VariableList
            selectedVariable={selectedVariable}
            variableValues={variableValues}
            onSelectVariable={onSelectVariable}
            className="border-t"
          />
          <VariableDetail
            variable={selectedVariableMeta}
            value={selectedVariableValue}
            onValueChange={onValueChange}
            className="border-t"
          />
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel defaultSize="33%" minSize="22%">
            <VariableList
              selectedVariable={selectedVariable}
              variableValues={variableValues}
              onSelectVariable={onSelectVariable}
              className="border-t"
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="62%" minSize="34%">
            <VariableDetail
              variable={selectedVariableMeta}
              value={selectedVariableValue}
              onValueChange={onValueChange}
              className="border-t"
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

function PromptEditorMessageRow({
  id,
  role,
  content,
  onCycleRole,
  onUpdateMessage,
  onAddImage,
  onAddFile,
  onDeleteMessage,
}: {
  id: string;
  role: PromptMessageRole;
  content: string;
  onCycleRole: (id: string) => void;
  onUpdateMessage: (id: string, content: string) => void;
  onAddImage: (id: string) => void;
  onAddFile: (id: string) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const variableCount = extractVariables(content).length;
  const roleToneClass =
    role === "System"
      ? "bg-blue-500/30"
      : role === "Assistant"
        ? "bg-violet-500/30"
        : "bg-emerald-500/30";
  const roleLabelClass =
    role === "System"
      ? "text-blue-600"
      : role === "Assistant"
        ? "text-violet-600"
        : "text-emerald-600";

  return (
    <div className="group relative flex w-full gap-3 pb-1">
      <div
        className={cn(
          "absolute top-0 bottom-0 left-0 w-0.5 shrink-0 opacity-30 transition-all group-focus-within:opacity-100 group-hover:w-1.5",
          roleToneClass,
        )}
      />
      <div className="flex w-full flex-col gap-1">
        <div className="bg-background sticky top-0 z-10 flex w-full items-center justify-between pr-3.5 pl-2">
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-6 px-2 text-xs font-bold", roleLabelClass)}
              type="button"
              onClick={() => onCycleRole(id)}
            >
              {role}
            </Button>
            <span className="text-muted-foreground flex items-center gap-1 text-xs font-bold opacity-70">
              <Brackets className="size-2.5 shrink-0 stroke-[3px]" />
              <span className="tabular-nums">{variableCount}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add image"
              type="button"
              onClick={() => onAddImage(id)}
            >
              <ImagePlus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add file"
              type="button"
              onClick={() => onAddFile(id)}
            >
              <FilePlus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete message"
              type="button"
              onClick={() => onDeleteMessage(id)}
            >
              <CircleMinus className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="px-3.5 text-base">
          <div className="flex flex-col gap-2.5">
            <Textarea
              value={content}
              name={`prompt-message-${id}`}
              aria-label={`${role} message`}
              placeholder="Write a message"
              onChange={(event) => onUpdateMessage(id, event.target.value)}
              className="min-h-20 resize-none rounded-none border-0 bg-transparent p-0 text-base/7 shadow-none focus-visible:ring-0 sm:text-sm/6"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaygroundSummaryRow({
  role,
  content,
}: {
  role: string;
  content: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="w-fit">
          {role}
        </Badge>
        <p className="text-muted-foreground text-xs">
          {extractVariables(content).length} vars
        </p>
      </div>
      <p className="text-muted-foreground truncate text-base/7 sm:text-sm/6">
        {content}
      </p>
    </div>
  );
}

function VariableList({
  selectedVariable,
  variableValues,
  onSelectVariable,
  className,
}: {
  selectedVariable: string;
  variableValues: Record<string, string>;
  onSelectVariable: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div role="list" className="flex flex-col gap-1">
          {PREVIEW_VARIABLES.map((variable) => (
            <button
              key={variable.key}
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left",
                variable.key === selectedVariable
                  ? "bg-muted"
                  : "hover:bg-muted/40",
              )}
              onClick={() => onSelectVariable(variable.key)}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{variable.label}</p>
                <Badge variant="outline">{variable.type}</Badge>
              </div>
              <p className="text-muted-foreground line-clamp-2 text-base/7 sm:text-sm/6">
                {variableValues[variable.key] ?? ""}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function VariableDetail({
  variable,
  value,
  onValueChange,
  className,
}: {
  variable: (typeof PREVIEW_VARIABLES)[number];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-medium">{variable.label}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 font-medium"
        >
          {variable.type}
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <Textarea
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="min-h-full resize-none rounded-none border-0 bg-transparent px-0 py-0 text-base/7 shadow-none focus-visible:ring-0 sm:text-sm/6"
        />
      </div>
    </div>
  );
}

function interpolateMessage(
  content: string,
  variableValues: Record<string, string>,
) {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    return variableValues[key] ?? `{{${key}}}`;
  });
}

function BenchmarkCard({
  label,
  value,
  numericValue,
  numericRange,
  hint,
  className,
  inverse = false,
}: {
  label: string;
  value: string;
  numericValue: number;
  numericRange: { min: number; max: number };
  hint: string;
  className?: string;
  inverse?: boolean;
}) {
  const fill = getBenchmarkFill(numericValue, numericRange, inverse);

  return (
    <div className={cn("px-3 py-2.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground truncate text-[10px] font-medium tracking-[0.08em] uppercase">
          {label}
        </span>
        <span className="text-muted-foreground shrink-0 text-[10px] leading-none">
          {hint}
        </span>
      </div>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
      <div className="bg-foreground/8 mt-2 h-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-current"
          style={{ width: `${Math.max(14, fill)}%` }}
        />
      </div>
    </div>
  );
}

function getBenchmarkRange(
  key:
    | "intelligenceValue"
    | "speedValue"
    | "latencyValue"
    | "blendedPriceValue",
) {
  const values = PREVIEW_MODELS.map((model) => model.benchmarks[key]);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function getBenchmarkFill(
  value: number,
  range: { min: number; max: number },
  inverse = false,
) {
  if (range.max === range.min) {
    return 100;
  }

  const normalized = ((value - range.min) / (range.max - range.min)) * 100;
  return inverse ? 100 - normalized : normalized;
}

function getBenchmarkHint(
  model: PreviewModel,
  key:
    | "intelligenceValue"
    | "speedValue"
    | "latencyValue"
    | "blendedPriceValue",
  inverse = false,
) {
  const value = model.benchmarks[key];
  const range = getBenchmarkRange(key);

  if ((!inverse && value === range.max) || (inverse && value === range.min)) {
    return "Best";
  }

  const fill = getBenchmarkFill(value, range, inverse);

  if (fill >= 75) {
    return "Strong";
  }

  if (fill >= 45) {
    return "Balanced";
  }

  return "Niche";
}
