import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { extractVariables } from "@langfuse/shared";
import {
  AlignVerticalJustifyStart,
  ArrowUpRight,
  Check,
  Brackets,
  ChevronsDown,
  ChevronDown,
  CircleParking,
  CircleMinus,
  CirclePlus,
  FilePlus,
  History,
  ImagePlus,
  Lightbulb,
  ListPlus,
  MoreHorizontal,
  OctagonX,
  Play,
  Plug,
  RefreshCcw,
  Ruler,
  SquareFunction,
  Thermometer,
  Type,
  Variable,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { CodeMirrorEditor } from "@/src/components/editor";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { env } from "@/src/env.mjs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
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
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { cn } from "@/src/utils/tailwind";
import { PromptFrame } from "../frames/PromptFrame";
import {
  getPromptBreadcrumbs,
  resolvePromptPreviewSlug,
} from "../shell/product-manifest";

export type PromptMessageRole = "System" | "User" | "Assistant";

export type PromptMessage = {
  id: string;
  role: PromptMessageRole;
  content: string;
};

export type PreviewModel = {
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

type PreviewModelSetting = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type PreviewProvider = {
  id: string;
  label: string;
  icon: string;
  apiKeyHref: string;
  apiKeyLabel: string;
  helper: string;
  placeholder: string;
};

type PreviewHistorySnapshot = {
  id: string;
  modelId: string;
  timestampLabel: string;
  formatterLabel: string;
  primaryToolLabel: string;
  toolChips: string[];
  variableValues: Record<string, string>;
  messages: PromptMessage[];
  settings: Array<{
    id: string;
    icon: LucideIcon;
    label: string;
  }>;
};

function getPreviewAssetPath(path: `/${string}`) {
  return `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}

export const PREVIEW_MODELS: PreviewModel[] = [
  {
    id: "openai::gpt-4.1-mini",
    label: "openai::gpt-4.1-mini",
    provider: "openai",
    providerLabel: "OpenAI",
    providerIcon: getPreviewAssetPath("/providers/openai/chatgpt.svg"),
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
    providerIcon: getPreviewAssetPath("/providers/openai/chatgpt.svg"),
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
    providerIcon: getPreviewAssetPath("/providers/anthropic/claude.svg"),
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
    providerIcon: getPreviewAssetPath("/providers/anthropic/claude.svg"),
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

const PREVIEW_PROVIDERS: PreviewProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    icon: getPreviewAssetPath("/providers/openai/chatgpt.svg"),
    apiKeyHref: "https://platform.openai.com/api-keys",
    apiKeyLabel: "Get OpenAI API key",
    helper:
      "Connect an OpenAI project key to unlock GPT models for this prompt thread.",
    placeholder: "sk-proj-...",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    icon: getPreviewAssetPath("/providers/anthropic/claude.svg"),
    apiKeyHref: "https://platform.claude.com/settings/keys",
    apiKeyLabel: "Get Anthropic API key",
    helper:
      "Connect an Anthropic key to switch this thread onto Claude models without leaving the picker.",
    placeholder: "sk-ant-...",
  },
] as const;

const PREVIEW_TOOL_LIBRARY = [
  "issue_classifier",
  "kb_lookup",
  "refund_policy",
  "priority_router",
] as const;

export const PREVIEW_TOOL_CHIPS = PREVIEW_TOOL_LIBRARY.slice(0, 2);

const PREVIEW_TOOL_TEMPLATE = `{
  "type": "function",
  "definition": {
    "schema": {
      "name": "name_of_function",
      "description": "Consider this description a mini-prompt for the LLM to use when calling this function. The more detailed the description, the better the LLM will understand the function.",
      "parameters": {
        "type": "object",
        "properties": {
          "param1": {
            "type": "string",
            "description": "A mini-prompt for the LLM to better understand the parameter."
          },
          "param2": {
            "type": "number",
            "description": "A mini-prompt for the LLM to better understand the parameter."
          }
        },
        "required": [
          "param1"
        ]
      }
    }
  }
}`;

const PREVIEW_MODEL_SETTINGS: PreviewModelSetting[] = [
  {
    id: "temperature",
    label: "Temperature",
    icon: Thermometer,
  },
  {
    id: "max-tokens",
    label: "Max tokens",
    icon: Ruler,
  },
  {
    id: "stop-sequence",
    label: "Stop sequence",
    icon: OctagonX,
  },
  {
    id: "top-p",
    label: "Top p",
    icon: CircleParking,
  },
  {
    id: "top-k",
    label: "Top k",
    icon: AlignVerticalJustifyStart,
  },
  {
    id: "tool-choice",
    label: "Tool choice",
    icon: Wrench,
  },
  {
    id: "mcp",
    label: "Mcp",
    icon: Plug,
  },
  {
    id: "reasoning-enabled",
    label: "Reasoning enabled",
    icon: Lightbulb,
  },
  {
    id: "max-reasoning-tokens",
    label: "Max reasoning tokens",
    icon: Ruler,
  },
] as const;

export const PREVIEW_PROMPT_MESSAGES: PromptMessage[] = [
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

function buildPreviewVariableValues(
  overrides: Partial<
    Record<(typeof PREVIEW_VARIABLES)[number]["key"], string>
  > = {},
) {
  return Object.fromEntries(
    PREVIEW_VARIABLES.map((variable) => [
      variable.key,
      overrides[variable.key] ?? variable.value,
    ]),
  );
}

const PREVIEW_HISTORY_SNAPSHOTS: PreviewHistorySnapshot[] = [
  {
    id: "history-1",
    modelId: "openai::gpt-4.1-mini",
    timestampLabel: "08:53 am · Oct 13, 2025",
    formatterLabel: "Pretty",
    primaryToolLabel: "issue_classifier",
    toolChips: ["issue_classifier", "priority_router"],
    variableValues: buildPreviewVariableValues(),
    messages: [
      {
        id: "history-1-system",
        role: "System",
        content:
          "You are a support triage assistant for {{product_area}}. Review {{issue_summary}} and prepare a concise handoff for the {{routing_queue}} queue.",
      },
      {
        id: "history-1-user",
        role: "User",
        content:
          "Respond in a {{customer_tone}} tone, call out the likely root cause, and propose the next internal action without promising a resolution date.",
      },
      {
        id: "history-1-assistant",
        role: "Assistant",
        content:
          "Likely root cause: the export pipeline drops filtered trace payloads when a session filter is active. Next internal action: route this to {{routing_queue}} with repro details focused on {{product_area}} exports.",
      },
    ],
    settings: [
      { id: "temperature", icon: Thermometer, label: "1.30" },
      { id: "max-tokens", icon: Ruler, label: "1024" },
      { id: "stop-sequence", icon: OctagonX, label: "None" },
      { id: "top-p", icon: CircleParking, label: "1.00" },
      { id: "top-k", icon: AlignVerticalJustifyStart, label: "0.00" },
      { id: "reasoning-enabled", icon: Lightbulb, label: "On" },
    ],
  },
  {
    id: "history-2",
    modelId: "openai::gpt-4.1-mini",
    timestampLabel: "08:51 am · Oct 13, 2025",
    formatterLabel: "Pretty",
    primaryToolLabel: "analyze_document_metadata",
    toolChips: ["issue_classifier", "kb_lookup"],
    variableValues: buildPreviewVariableValues({
      issue_summary:
        "Customer cannot export filtered traces to CSV while a session filter is active.",
      customer_tone: "neutral and operational",
    }),
    messages: [
      {
        id: "history-2-system",
        role: "System",
        content:
          "You are an expert support summarizer for {{product_area}}. Review {{issue_summary}} and create a handoff for {{routing_queue}} without losing operational context.",
      },
      {
        id: "history-2-user",
        role: "User",
        content:
          "Return exactly 3 sections: likely cause, evidence to collect, and next owner. Keep the tone {{customer_tone}} and internal.",
      },
    ],
    settings: [
      { id: "temperature", icon: Thermometer, label: "1.10" },
      { id: "max-tokens", icon: Ruler, label: "900" },
      { id: "stop-sequence", icon: OctagonX, label: "None" },
      { id: "top-p", icon: CircleParking, label: "1.00" },
      { id: "tool-choice", icon: Wrench, label: "Auto" },
      { id: "reasoning-enabled", icon: Lightbulb, label: "On" },
    ],
  },
  {
    id: "history-3",
    modelId: "anthropic::claude-sonnet-4",
    timestampLabel: "05:05 pm · Oct 10, 2025",
    formatterLabel: "Pretty",
    primaryToolLabel: "priority_router",
    toolChips: ["priority_router"],
    variableValues: buildPreviewVariableValues({
      product_area: "Trace ingestion",
      issue_summary:
        "Enterprise workspace reports delayed trace ingestion after rotating collector credentials.",
      routing_queue: "support-platform",
      customer_tone: "measured and confident",
    }),
    messages: [
      {
        id: "history-3-system",
        role: "System",
        content:
          "You are a support triage assistant for {{product_area}}. Review {{issue_summary}} and decide whether {{routing_queue}} should escalate to engineering.",
      },
      {
        id: "history-3-user",
        role: "User",
        content:
          "Draft a short internal handoff in a {{customer_tone}} tone and state the first investigation step.",
      },
    ],
    settings: [
      { id: "temperature", icon: Thermometer, label: "0.90" },
      { id: "max-tokens", icon: Ruler, label: "850" },
      { id: "stop-sequence", icon: OctagonX, label: "None" },
      { id: "top-p", icon: CircleParking, label: "0.95" },
      { id: "tool-choice", icon: Wrench, label: "Required" },
      { id: "reasoning-enabled", icon: Lightbulb, label: "Off" },
    ],
  },
  {
    id: "history-4",
    modelId: "openai::gpt-4.1",
    timestampLabel: "05:02 pm · Oct 10, 2025",
    formatterLabel: "Pretty",
    primaryToolLabel: "refund_policy",
    toolChips: ["refund_policy", "issue_classifier"],
    variableValues: buildPreviewVariableValues({
      product_area: "Billing",
      issue_summary:
        "Customer was double charged after retrying a failed upgrade checkout.",
      routing_queue: "support-billing",
      customer_tone: "calm and reassuring",
    }),
    messages: [
      {
        id: "history-4-system",
        role: "System",
        content:
          "You are a support triage assistant for {{product_area}}. Review {{issue_summary}} and outline the safest next step for {{routing_queue}}.",
      },
      {
        id: "history-4-user",
        role: "User",
        content:
          "Use a {{customer_tone}} tone, highlight refund risk, and keep the draft short enough for an on-call handoff.",
      },
    ],
    settings: [
      { id: "temperature", icon: Thermometer, label: "1.00" },
      { id: "max-tokens", icon: Ruler, label: "700" },
      { id: "stop-sequence", icon: OctagonX, label: "None" },
      { id: "top-p", icon: CircleParking, label: "1.00" },
      { id: "top-k", icon: AlignVerticalJustifyStart, label: "0.00" },
      { id: "reasoning-enabled", icon: Lightbulb, label: "Off" },
    ],
  },
  {
    id: "history-5",
    modelId: "openai::gpt-4.1-mini",
    timestampLabel: "04:58 pm · Oct 10, 2025",
    formatterLabel: "Pretty",
    primaryToolLabel: "kb_lookup",
    toolChips: ["kb_lookup", "issue_classifier"],
    variableValues: buildPreviewVariableValues({
      product_area: "Evaluations",
      issue_summary:
        "Team cannot rerun a production eval after editing the underlying dataset item.",
      routing_queue: "support-evals",
      customer_tone: "clear and concise",
    }),
    messages: [
      {
        id: "history-5-system",
        role: "System",
        content:
          "You are a support triage assistant for {{product_area}}. Review {{issue_summary}} and explain what {{routing_queue}} should verify first.",
      },
      {
        id: "history-5-user",
        role: "User",
        content:
          "Use a {{customer_tone}} tone and include one likely root cause plus one mitigation.",
      },
    ],
    settings: [
      { id: "temperature", icon: Thermometer, label: "1.20" },
      { id: "max-tokens", icon: Ruler, label: "768" },
      { id: "stop-sequence", icon: OctagonX, label: "None" },
      { id: "top-p", icon: CircleParking, label: "1.00" },
      { id: "tool-choice", icon: Wrench, label: "Auto" },
      { id: "reasoning-enabled", icon: Lightbulb, label: "On" },
    ],
  },
];

function getShortModelLabel(model: PreviewModel) {
  return model.label.split("::").at(1) ?? model.label;
}

export default function PromptIterateScreen() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { promptPath } = resolvePromptPreviewSlug(router.query.slug);
  const [selectedModelId, setSelectedModelId] = useState(PREVIEW_MODELS[0]!.id);
  const [toolChips, setToolChips] = useState<string[]>([...PREVIEW_TOOL_CHIPS]);
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

  const addTool = (toolLabel?: string) => {
    if (toolLabel) {
      setToolChips((current) =>
        current.includes(toolLabel) ? current : [...current, toolLabel],
      );
      return;
    }

    const nextTool = PREVIEW_TOOL_LIBRARY.find(
      (tool) => !toolChips.includes(tool),
    );

    if (!nextTool) {
      setToolChips([...PREVIEW_TOOL_CHIPS]);
      return;
    }

    setToolChips((current) => [...current, nextTool]);
  };

  const restoreHistorySnapshot = (snapshot: PreviewHistorySnapshot) => {
    setSelectedModelId(snapshot.modelId);
    setToolChips([...snapshot.toolChips]);
    setPromptMessages(snapshot.messages.map((message) => ({ ...message })));
    setVariableValues({ ...snapshot.variableValues });
  };

  return (
    <PromptFrame
      projectId={projectId}
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
                  selectedModel={selectedModel}
                  messages={promptMessages}
                  variableValues={variableValues}
                  onRestoreSnapshot={restoreHistorySnapshot}
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
              selectedModel={selectedModel}
              messages={promptMessages}
              variableValues={variableValues}
              onRestoreSnapshot={restoreHistorySnapshot}
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

export function PromptDraftPane({
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
  onAddTool: (toolLabel?: string) => void;
  onAddMessage: () => void;
  onCycleRole: (id: string) => void;
  onUpdateMessage: (id: string, content: string) => void;
  onAddImage: (id: string) => void;
  onAddFile: (id: string) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [modelSettingsPopoverOpen, setModelSettingsPopoverOpen] =
    useState(false);
  const [addToolDialogOpen, setAddToolDialogOpen] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState(
    selectedModel.provider,
  );
  const [providerConnections, setProviderConnections] = useState<
    Partial<Record<string, string>>
  >({});
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [toolDefinitionDraft, setToolDefinitionDraft] = useState(
    PREVIEW_TOOL_TEMPLATE,
  );
  const [highlightedModelId, setHighlightedModelId] = useState(
    selectedModel.id,
  );

  const highlightedModel =
    PREVIEW_MODELS.find((model) => model.id === highlightedModelId) ??
    selectedModel;
  const selectedProvider =
    PREVIEW_PROVIDERS.find((provider) => provider.id === selectedProviderId) ??
    PREVIEW_PROVIDERS[0]!;
  const providerModels = PREVIEW_MODELS.filter(
    (model) => model.provider === selectedProvider.id,
  );
  const activeProviderKey = providerConnections[selectedProvider.id];

  const openAddToolDialog = () => {
    setToolDefinitionDraft(PREVIEW_TOOL_TEMPLATE);
    setAddToolDialogOpen(true);
  };

  const saveProviderConnection = () => {
    const trimmedKey = apiKeyDraft.trim();

    if (!trimmedKey) {
      showErrorToast(
        "API key required",
        `Paste a ${selectedProvider.label} API key before saving the connection.`,
        "WARNING",
      );
      return;
    }

    setProviderConnections((current) => ({
      ...current,
      [selectedProvider.id]: trimmedKey,
    }));
    setApiKeyDraft("");
  };

  const handleSaveTool = () => {
    try {
      const parsed = JSON.parse(toolDefinitionDraft) as {
        type?: string;
        definition?: {
          schema?: {
            name?: string;
          };
        };
      };

      if (
        parsed.type !== "function" ||
        typeof parsed.definition?.schema?.name !== "string" ||
        parsed.definition.schema.name.trim().length === 0
      ) {
        showErrorToast(
          "Invalid tool format",
          'Tool JSON must include type "function" and definition.schema.name.',
          "WARNING",
        );
        return;
      }

      onAddTool(parsed.definition.schema.name.trim());
      setAddToolDialogOpen(false);
    } catch {
      showErrorToast(
        "Invalid JSON",
        "Please provide valid JSON before saving the tool.",
        "WARNING",
      );
    }
  };

  return (
    <div className="group/editor bg-background flex h-full flex-col overflow-hidden">
      <div className="border-b">
        <div className="flex flex-wrap items-center justify-start gap-2 px-4 py-3">
          <div className="flex shrink-0 items-center gap-2">
            <Popover
              open={modelPopoverOpen}
              onOpenChange={(open) => {
                setModelPopoverOpen(open);
                if (open) {
                  setSelectedProviderId(selectedModel.provider);
                  setHighlightedModelId(selectedModel.id);
                  setApiKeyDraft("");
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border/70 bg-background/90 h-8 justify-start gap-2 px-2.5 shadow-none"
                  type="button"
                >
                  <Image
                    width="14"
                    height="14"
                    className="size-3.5"
                    src={selectedModel.providerIcon}
                    alt={`${selectedModel.providerLabel} icon`}
                    unoptimized
                  />
                  <span className="text-muted-foreground">
                    {selectedModel.providerLabel}
                  </span>
                  <span className="text-muted-foreground/60">/</span>
                  <span>{getShortModelLabel(selectedModel)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="z-50 w-[min(960px,calc(100vw-2rem))] border-0 bg-transparent p-0 shadow-none"
              >
                <div className="bg-background grid overflow-hidden rounded-lg border shadow-sm md:grid-cols-[180px_250px_minmax(0,1fr)]">
                  <div className="border-b md:border-r md:border-b-0">
                    <div className="border-b px-3 py-2.5">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Providers
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 px-2 py-2">
                      {PREVIEW_PROVIDERS.map((provider) => {
                        const isActive = provider.id === selectedProvider.id;
                        const hasConnection = Boolean(
                          providerConnections[provider.id],
                        );

                        return (
                          <button
                            key={provider.id}
                            type="button"
                            className={cn(
                              "border-border/60 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                              isActive
                                ? "bg-background text-foreground"
                                : "hover:bg-background text-muted-foreground",
                            )}
                            onClick={() => {
                              setSelectedProviderId(provider.id);
                              setApiKeyDraft("");
                              setHighlightedModelId(
                                PREVIEW_MODELS.find(
                                  (model) => model.provider === provider.id,
                                )?.id ?? highlightedModel.id,
                              );
                            }}
                          >
                            <div className="mr-[-3px] flex size-4 items-center justify-center">
                              <Image
                                width="14"
                                height="14"
                                className="size-3.5"
                                src={provider.icon}
                                alt={`${provider.label} icon`}
                                unoptimized
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {provider.label}
                              </p>
                              <p className="text-[11px]">
                                {hasConnection ? "Connected" : "Needs API key"}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="border-b md:border-r md:border-b-0">
                    <div className="border-b px-3 py-2.5">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Models
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 px-2 py-2">
                      {providerModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className={cn(
                            "border-border/60 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                            model.id === highlightedModel.id
                              ? "bg-background text-foreground"
                              : "hover:bg-background text-muted-foreground",
                          )}
                          onClick={() => setHighlightedModelId(model.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {getShortModelLabel(model)}
                            </p>
                            <p className="truncate text-[11px]">
                              {model.benchmarks.speed} ·{" "}
                              {model.benchmarks.blendedPrice}
                            </p>
                          </div>
                          <Check
                            className={cn(
                              "size-3.5 shrink-0",
                              model.id === selectedModel.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                        </button>
                      ))}
                    </div>
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
                                  src={selectedProvider.icon}
                                  alt={`${selectedProvider.label} icon`}
                                  unoptimized
                                />
                              </div>
                              <span>{selectedProvider.label}</span>
                            </div>
                            <p className="mt-1 truncate text-sm font-medium">
                              {getShortModelLabel(highlightedModel)}
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
                        <div className="bg-background rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">
                                Provider connection
                              </p>
                              <p className="text-muted-foreground mt-1 text-[11px] leading-5">
                                {selectedProvider.helper}
                              </p>
                            </div>
                            <Badge variant="outline">
                              {activeProviderKey ? "Connected" : "Needs key"}
                            </Badge>
                          </div>
                          {activeProviderKey ? (
                            <p className="text-muted-foreground mt-3 text-[11px]">
                              Connected with{" "}
                              <span className="text-foreground font-medium">
                                {maskApiKey(activeProviderKey)}
                              </span>
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-col gap-2">
                            <div className="flex gap-2">
                              <Input
                                name={`${selectedProvider.id}-api-key`}
                                value={apiKeyDraft}
                                onChange={(event) =>
                                  setApiKeyDraft(event.target.value)
                                }
                                type="password"
                                aria-label={`${selectedProvider.label} API key`}
                                placeholder={selectedProvider.placeholder}
                                className="h-8"
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 shrink-0 px-3"
                                onClick={saveProviderConnection}
                              >
                                {activeProviderKey ? "Update key" : "Save key"}
                              </Button>
                            </div>
                            <Link
                              href={selectedProvider.apiKeyHref}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] font-medium underline underline-offset-2"
                            >
                              {selectedProvider.apiKeyLabel}
                              <ArrowUpRight className="size-3" />
                            </Link>
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
            <Popover
              open={modelSettingsPopoverOpen}
              onOpenChange={setModelSettingsPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border/70 bg-background/90 h-8 w-8 shrink-0 self-center px-0 shadow-none"
                  type="button"
                  aria-label="Open model settings"
                >
                  <MoreHorizontal className="size-3.5 translate-y-[-0.5px]" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="bg-background w-auto min-w-[220px] overflow-hidden p-0"
              >
                <Command className="bg-background rounded-md shadow-none">
                  <div className="border-b px-1.5">
                    <CommandInput
                      placeholder="Search model settings..."
                      aria-label="Search model settings"
                      showBorder={false}
                      className="h-9"
                    />
                  </div>
                  <CommandList className="max-h-[360px] overflow-y-auto px-2 py-2">
                    <CommandEmpty>No model setting found.</CommandEmpty>
                    <CommandGroup className="px-0 py-0">
                      {PREVIEW_MODEL_SETTINGS.map((setting) => (
                        <CommandItem
                          key={setting.id}
                          value={setting.label}
                          className="data-[selected=true]:bg-background gap-2 rounded-md border px-2.5 py-2 text-sm"
                        >
                          <span className="flex size-4 items-center justify-center">
                            <setting.icon className="text-muted-foreground size-3.5" />
                          </span>
                          <span className="text-sm">{setting.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-muted-foreground shrink-0 text-sm font-medium">
            Tools
          </span>
          {toolChips.map((tool) => (
            <Button
              key={tool}
              variant="outline"
              size="sm"
              className="border-border/70 bg-background h-7 shrink-0 gap-1 rounded-full px-3 font-medium shadow-none"
              type="button"
            >
              <SquareFunction className="size-3" />
              <span className="truncate">{tool}</span>
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="border-border/70 bg-background h-7 shrink-0 gap-1 rounded-full border-dashed px-3 shadow-none"
            type="button"
            title="Add tool"
            onClick={openAddToolDialog}
          >
            <CirclePlus className="size-3.5" />
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </div>
      </div>
      <Dialog open={addToolDialogOpen} onOpenChange={setAddToolDialogOpen}>
        <DialogContent
          className="max-w-[700px] rounded-xl p-0 shadow-sm"
          closeOnInteractionOutside
        >
          <DialogHeader className="px-6 py-5">
            <DialogTitle className="text-base font-medium">
              Add Tool
            </DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Define a tool in a valid Tool format. You can also add an optional{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-[0.85em]">
                request
              </code>{" "}
              object to automatically generate a tool response in the
              playground.
              <br />
              <br />
              Refer to the{" "}
              <a
                className="text-foreground font-semibold underline underline-offset-2"
                href="https://langfuse.com/changelog/2025-03-28-tool-calling-structured-output-playground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tool schema documentation
              </a>{" "}
              for reference and examples.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="max-h-[60vh] px-6 py-0">
            <div className="overflow-hidden rounded-md border">
              <CodeMirrorEditor
                value={toolDefinitionDraft}
                onChange={setToolDefinitionDraft}
                mode="json"
                minHeight={530}
              />
            </div>
          </DialogBody>
          <DialogFooter className="px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddToolDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveTool}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div role="list" className="flex flex-col gap-4">
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
        <div className="mt-4 flex items-center justify-center opacity-0 transition-opacity group-hover/editor:opacity-100 focus-within:opacity-100">
          <Button
            variant="outline"
            size="sm"
            className="border-border/70 bg-background h-9 rounded-full border-dashed px-4 font-medium shadow-none"
            type="button"
            onClick={onAddMessage}
          >
            Add Message
          </Button>
        </div>
      </div>
    </div>
  );
}

function maskApiKey(value: string) {
  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function PlaygroundPreviewPane({
  selectedModel,
  messages,
  variableValues,
  onRestoreSnapshot,
}: {
  selectedModel: PreviewModel;
  messages: PromptMessage[];
  variableValues: Record<string, string>;
  onRestoreSnapshot: (snapshot: PreviewHistorySnapshot) => void;
}) {
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [runOptionsOpen, setRunOptionsOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(
    PREVIEW_HISTORY_SNAPSHOTS[1]?.id ?? PREVIEW_HISTORY_SNAPSHOTS[0]?.id ?? "",
  );
  const selectedHistorySnapshot =
    PREVIEW_HISTORY_SNAPSHOTS.find(
      (snapshot) => snapshot.id === selectedHistoryId,
    ) ?? PREVIEW_HISTORY_SNAPSHOTS[0];

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-semibold">Playground</p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setHistoryDialogOpen(true)}
            >
              <History className="size-4" />
              History
            </Button>
            <div className="inline-flex">
              <Button size="sm" className="rounded-r-none">
                <Play className="size-4" />
                Run
              </Button>
              <Popover open={runOptionsOpen} onOpenChange={setRunOptionsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="icon-sm"
                    className="rounded-l-none border-l"
                    type="button"
                    aria-label="Open run options"
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={8}
                  className="bg-background w-[18.5rem] overflow-hidden p-0 shadow-sm"
                >
                  <Command className="bg-background rounded-none shadow-none">
                    <CommandList className="max-h-none overflow-visible p-2">
                      <CommandGroup className="px-0 py-0">
                        <CommandItem
                          value="Run Append to existing Playground"
                          className="data-[selected=true]:bg-background gap-3 rounded-lg border px-2.5 py-2.5"
                          onSelect={() => setRunOptionsOpen(false)}
                        >
                          <span className="bg-background flex size-10 shrink-0 items-center justify-center rounded-md border">
                            <Play className="text-muted-foreground size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Run</p>
                            <p className="text-muted-foreground text-xs">
                              Append to existing Playground
                            </p>
                          </div>
                        </CommandItem>
                        <CommandItem
                          value="Clear and run Clear existing Playground and run"
                          className="data-[selected=true]:bg-background gap-3 rounded-lg border px-2.5 py-2.5"
                          onSelect={() => setRunOptionsOpen(false)}
                        >
                          <span className="bg-background flex size-10 shrink-0 items-center justify-center rounded-md border">
                            <RefreshCcw className="text-muted-foreground size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              Clear &amp; run
                            </p>
                            <p className="text-muted-foreground text-xs">
                              Clear existing Playground and run
                            </p>
                          </div>
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div role="list" className="flex flex-col gap-3">
            {messages.map((message) => (
              <PlaygroundSummaryRow
                key={message.id}
                role={message.role}
                content={message.content}
                variableValues={variableValues}
              />
            ))}
          </div>
        </div>
      </div>
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent
          className="max-w-[min(1240px,calc(100vw-2rem))] overflow-hidden rounded-[1.4rem] p-0 shadow-xl"
          closeOnInteractionOutside
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="text-[2rem] font-medium tracking-[-0.03em]">
              History
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[78vh] overflow-hidden p-0">
            <div className="grid min-h-[68vh] grid-cols-1 md:grid-cols-[270px_minmax(0,1fr)]">
              <div className="border-b md:border-r md:border-b-0">
                <div
                  role="list"
                  className="flex h-full flex-col overflow-y-auto p-3"
                >
                  {PREVIEW_HISTORY_SNAPSHOTS.map((snapshot) => {
                    const snapshotModel =
                      PREVIEW_MODELS.find(
                        (model) => model.id === snapshot.modelId,
                      ) ?? selectedModel;
                    const isSelected =
                      snapshot.id === selectedHistorySnapshot?.id;

                    return (
                      <button
                        key={snapshot.id}
                        type="button"
                        onClick={() => setSelectedHistoryId(snapshot.id)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border border-transparent px-3 py-3 text-left",
                          isSelected
                            ? "bg-background border-emerald-500/20"
                            : "hover:bg-background",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Image
                            width="16"
                            height="16"
                            className="size-4"
                            src={snapshotModel.providerIcon}
                            alt={`${snapshotModel.providerLabel} icon`}
                            unoptimized
                          />
                          <span className="text-sm font-semibold">
                            / {getShortModelLabel(snapshotModel)}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {snapshot.timestampLabel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedHistorySnapshot ? (
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <HistoryMetaPill
                        providerIcon={
                          PREVIEW_MODELS.find(
                            (model) =>
                              model.id === selectedHistorySnapshot.modelId,
                          )?.providerIcon ?? selectedModel.providerIcon
                        }
                        label={`/${getShortModelLabel(
                          PREVIEW_MODELS.find(
                            (model) =>
                              model.id === selectedHistorySnapshot.modelId,
                          ) ?? selectedModel,
                        )}`}
                      />
                      {selectedHistorySnapshot.settings.map((setting) => (
                        <HistoryMetaPill
                          key={setting.id}
                          icon={setting.icon}
                          label={setting.label}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2 font-medium shadow-none"
                        type="button"
                      >
                        {selectedHistorySnapshot.formatterLabel}
                        <ChevronDown className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        type="button"
                        onClick={() => {
                          onRestoreSnapshot(selectedHistorySnapshot);
                          setHistoryDialogOpen(false);
                        }}
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-md font-medium"
                        >
                          {selectedHistorySnapshot.primaryToolLabel}
                        </Badge>
                        {selectedHistorySnapshot.toolChips
                          .filter(
                            (tool) =>
                              tool !== selectedHistorySnapshot.primaryToolLabel,
                          )
                          .map((tool) => (
                            <Badge
                              key={tool}
                              variant="outline"
                              className="rounded-md font-medium"
                            >
                              {tool}
                            </Badge>
                          ))}
                      </div>
                      <div className="flex flex-col gap-6">
                        {selectedHistorySnapshot.messages.map((message) => (
                          <HistoryPromptMessage
                            key={message.id}
                            role={message.role}
                            content={message.content}
                            variableValues={
                              selectedHistorySnapshot.variableValues
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryMetaPill({
  icon: Icon,
  providerIcon,
  label,
}: {
  icon?: LucideIcon;
  providerIcon?: string;
  label: string;
}) {
  return (
    <div className="bg-background text-foreground inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium">
      {providerIcon ? (
        <Image
          width="14"
          height="14"
          className="size-3.5"
          src={providerIcon}
          alt=""
          unoptimized
        />
      ) : Icon ? (
        <Icon className="text-muted-foreground size-3.5" />
      ) : null}
      <span>{label}</span>
    </div>
  );
}

function HistoryPromptMessage({
  role,
  content,
  variableValues,
}: {
  role: PromptMessageRole;
  content: string;
  variableValues: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <span>{role}</span>
      </div>
      <InlineVariableText
        content={content}
        variableValues={variableValues}
        resolveVariables
        className="text-foreground text-[0.97rem]/7 sm:text-sm/6"
      />
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
      {stackOnMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Variable className="size-4" />
                <p className="text-sm font-medium">
                  {PREVIEW_VARIABLES.length} variables
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 font-medium"
              >
                <ListPlus className="size-3.5" />
                Link dataset
              </Button>
            </div>
          </div>
          <VariableList
            selectedVariable={selectedVariable}
            variableValues={variableValues}
            onSelectVariable={onSelectVariable}
            className="border-b"
            compact
          />
          <VariableDetail
            variable={selectedVariableMeta}
            value={selectedVariableValue}
            onValueChange={onValueChange}
            className="h-full"
          />
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel defaultSize="22%" minSize="16%">
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex w-full shrink-0 flex-row items-center px-4 py-3">
                <div className="flex h-6 w-full flex-row items-center justify-between">
                  <div className="flex flex-row items-center space-x-3.5">
                    <Variable className="size-4" />
                    <span className="truncate text-sm font-medium">
                      {PREVIEW_VARIABLES.length} variables
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 shadow-none"
                    type="button"
                    aria-label="Link dataset"
                  >
                    <ListPlus className="size-3.5" />
                  </Button>
                </div>
              </div>
              <VariableList
                selectedVariable={selectedVariable}
                variableValues={variableValues}
                onSelectVariable={onSelectVariable}
                className="min-h-0 flex-1"
              />
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="78%" minSize="34%">
            <VariableDetail
              variable={selectedVariableMeta}
              value={selectedVariableValue}
              onValueChange={onValueChange}
              className="h-full"
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

function getMessageRoleAppearance(role: PromptMessageRole) {
  const isSystem = role === "System";
  const isOutgoing = role === "User";

  return {
    isSystem,
    isOutgoing,
    rowClass: isSystem
      ? "items-center"
      : isOutgoing
        ? "items-end"
        : "items-start",
    metaClass: isSystem
      ? "justify-center"
      : isOutgoing
        ? "justify-end"
        : "justify-start",
    bubbleClass: isSystem
      ? "bg-background border-sky-500/18"
      : isOutgoing
        ? "bg-background border-emerald-500/18"
        : "bg-background border-border/70",
    bubbleRadiusClass: isSystem
      ? "rounded-2xl"
      : isOutgoing
        ? "rounded-[1.35rem] rounded-br-md"
        : "rounded-[1.35rem] rounded-bl-md",
    roleTextClass: isSystem
      ? "text-sky-700 dark:text-sky-300"
      : isOutgoing
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-slate-700 dark:text-slate-200",
  };
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
  const variableKeys = getUniqueVariableKeys(content);
  const appearance = getMessageRoleAppearance(role);

  return (
    <div
      className={cn("group/message flex w-full flex-col", appearance.rowClass)}
    >
      <div
        className={cn(
          "flex w-full max-w-[88%] flex-col gap-1",
          appearance.isOutgoing && "items-end",
          appearance.isSystem && "max-w-[94%] items-center",
        )}
      >
        <div
          className={cn(
            "flex w-full items-center gap-2 px-1",
            appearance.metaClass,
          )}
        >
          <div
            className={cn(
              "flex min-w-0 items-center gap-2 overflow-hidden",
              appearance.isOutgoing && "flex-row-reverse",
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 rounded-full px-2.5 text-[11px] font-medium shadow-none",
                appearance.roleTextClass,
              )}
              type="button"
              onClick={() => onCycleRole(id)}
            >
              {role}
            </Button>
            {variableKeys.length > 0 ? (
              <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium opacity-75">
                <Brackets className="size-2.5 shrink-0 stroke-[3px]" />
                <span className="tabular-nums">{variableKeys.length}</span>
              </span>
            ) : null}
          </div>
          <div
            className={cn(
              "bg-background flex shrink-0 items-center rounded-full border px-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100",
              appearance.isOutgoing && "order-first",
            )}
          >
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
        <div
          className={cn(
            "w-full overflow-hidden border px-3.5 py-3",
            appearance.bubbleClass,
            appearance.bubbleRadiusClass,
          )}
        >
          <HighlightedVariableTextarea
            value={content}
            name={`prompt-message-${id}`}
            ariaLabel={`${role} message`}
            placeholder="Write a message"
            onChange={(event) => onUpdateMessage(id, event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function PlaygroundSummaryRow({
  role,
  content,
  variableValues,
}: {
  role: PromptMessageRole;
  content: string;
  variableValues: Record<string, string>;
}) {
  const appearance = getMessageRoleAppearance(role);
  const variableKeys = getUniqueVariableKeys(content);

  return (
    <div className={cn("flex w-full", appearance.metaClass)}>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1",
          appearance.isOutgoing && "items-end",
          appearance.isSystem && "items-center",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-1",
            appearance.isOutgoing && "flex-row-reverse",
          )}
        >
          <Badge variant="outline" className="w-fit rounded-full">
            {role}
          </Badge>
          {variableKeys.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {variableKeys.length} vars
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "w-full rounded-[1.35rem] border px-3.5 py-3",
            appearance.bubbleClass,
            appearance.bubbleRadiusClass,
          )}
        >
          <InlineVariableText
            content={content}
            variableValues={variableValues}
            resolveVariables
            className="text-foreground text-base/7 sm:text-sm/6"
          />
        </div>
      </div>
    </div>
  );
}

function VariableList({
  selectedVariable,
  variableValues,
  onSelectVariable,
  className,
  compact = false,
}: {
  selectedVariable: string;
  variableValues: Record<string, string>;
  onSelectVariable: (value: string) => void;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 overflow-x-auto px-3.5 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
        role="list"
      >
        {PREVIEW_VARIABLES.map((variable) => {
          const selected = variable.key === selectedVariable;
          const accent = getVariableAccentClasses(variable.key, selected);

          return (
            <button
              key={variable.key}
              className={cn(
                "group border-border/60 flex max-w-[18rem] shrink-0 flex-col items-start justify-center truncate rounded-md border px-3 py-2 text-left select-none",
                accent.containerClass,
              )}
              type="button"
              data-selected={selected}
              onClick={() => onSelectVariable(variable.key)}
            >
              <div
                className={cn(
                  "flex w-full items-center justify-between gap-4 truncate text-left text-sm font-semibold whitespace-nowrap",
                  accent.titleClass,
                )}
              >
                <span className="truncate">{variable.label}</span>
                <Type className="mr-px size-3 shrink-0" />
              </div>
              <div
                className={cn(
                  "w-full truncate text-left text-sm",
                  accent.valueClass,
                )}
              >
                <span>{variableValues[variable.key] ?? ""}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3.5">
        <div role="list" className="flex flex-col gap-1">
          {PREVIEW_VARIABLES.map((variable) => {
            const selected = variable.key === selectedVariable;
            const accent = getVariableAccentClasses(variable.key, selected);

            return (
              <button
                key={variable.key}
                className={cn(
                  "group border-border/60 flex w-full max-w-full min-w-full shrink-0 flex-col items-start justify-center truncate rounded-md border px-3 py-2 text-left select-none",
                  accent.containerClass,
                )}
                type="button"
                data-selected={selected}
                onClick={() => onSelectVariable(variable.key)}
              >
                <div
                  className={cn(
                    "flex w-full items-center justify-between gap-4 truncate text-left text-sm font-semibold whitespace-nowrap",
                    accent.titleClass,
                  )}
                >
                  <span className="truncate">{variable.label}</span>
                  <Type className="mr-px size-3 shrink-0" />
                </div>
                <div
                  className={cn(
                    "w-full max-w-full min-w-full truncate text-left text-sm",
                    accent.valueClass,
                  )}
                >
                  <span>{variableValues[variable.key] ?? ""}</span>
                </div>
              </button>
            );
          })}
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
      <div className="flex h-12 w-full shrink-0 items-center justify-between py-3 pr-3.5 pl-2">
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 font-medium shadow-none"
            type="button"
          >
            <Type className="size-3" />
            {variable.type}
            <ChevronDown className="size-3" />
          </Button>
        </div>
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 shadow-none"
            type="button"
            aria-label="Collapse variable editor"
          >
            <ChevronsDown className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3.5">
        <Textarea
          name={`variable-${variable.key}`}
          aria-label={`${variable.label} value`}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Enter the variable value here"
          className="size-full min-h-0 resize-none rounded-none border-0 bg-transparent px-2 py-2 pb-3.5 text-base leading-6 shadow-none focus-visible:ring-0 sm:text-sm sm:leading-6"
        />
      </div>
    </div>
  );
}

function getVariableAccentClasses(variableKey: string, selected: boolean) {
  const accent = getVariableAccentPalette(variableKey);

  return {
    containerClass: selected
      ? accent.selectedContainer
      : cn("text-muted-foreground", accent.hoverContainer),
    titleClass: selected ? accent.title : "text-foreground",
    valueClass: selected ? accent.value : "text-muted-foreground",
  };
}

function getVariableAccentPalette(variableKey: string) {
  const palette = [
    {
      selectedContainer: "bg-background border-sky-500/20",
      inlineContainer: "bg-sky-500/8",
      hoverContainer: "hover:bg-background",
      title: "text-sky-700 dark:text-sky-300",
      value: "text-sky-700/80 dark:text-sky-300/80",
      tagBorder: "border-sky-500/20 dark:border-sky-400/20",
    },
    {
      selectedContainer: "bg-background border-emerald-500/20",
      inlineContainer: "bg-emerald-500/8",
      hoverContainer: "hover:bg-background",
      title: "text-emerald-700 dark:text-emerald-300",
      value: "text-emerald-700/80 dark:text-emerald-300/80",
      tagBorder: "border-emerald-500/20 dark:border-emerald-400/20",
    },
    {
      selectedContainer: "bg-background border-violet-500/20",
      inlineContainer: "bg-violet-500/8",
      hoverContainer: "hover:bg-background",
      title: "text-violet-700 dark:text-violet-300",
      value: "text-violet-700/80 dark:text-violet-300/80",
      tagBorder: "border-violet-500/20 dark:border-violet-400/20",
    },
    {
      selectedContainer: "bg-background border-amber-500/20",
      inlineContainer: "bg-amber-500/8",
      hoverContainer: "hover:bg-background",
      title: "text-amber-700 dark:text-amber-300",
      value: "text-amber-700/80 dark:text-amber-300/80",
      tagBorder: "border-amber-500/20 dark:border-amber-400/20",
    },
  ] as const;

  const variableIndex = PREVIEW_VARIABLES.findIndex(
    (variable) => variable.key === variableKey,
  );

  return palette[(variableIndex >= 0 ? variableIndex : 0) % palette.length]!;
}

function HighlightedVariableTextarea({
  value,
  name,
  ariaLabel,
  placeholder,
  onChange,
}: {
  value: string;
  name: string;
  ariaLabel: string;
  placeholder: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="relative min-h-20">
      {value ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <InlineVariableText
            content={value}
            className="text-foreground text-[15px] leading-6 break-words whitespace-pre-wrap sm:text-sm/6"
          />
        </div>
      ) : null}
      <Textarea
        value={value}
        name={name}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={onChange}
        className={cn(
          "relative min-h-20 resize-none rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0",
          "text-[15px] leading-6 caret-current sm:text-sm/6",
          value
            ? "text-transparent placeholder:text-transparent"
            : "text-foreground placeholder:text-muted-foreground/70",
        )}
      />
    </div>
  );
}

function InlineVariableText({
  content,
  variableValues,
  resolveVariables = false,
  className,
}: {
  content: string;
  variableValues?: Record<string, string>;
  resolveVariables?: boolean;
  className?: string;
}) {
  const segments = getMessageSegments(content);

  return (
    <div className={cn("break-words whitespace-pre-wrap", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={`${segment.type}-${index}`}>{segment.value}</span>;
        }

        const accent = getVariableAccentPalette(segment.key);
        const label = resolveVariables
          ? (variableValues?.[segment.key] ?? segment.raw)
          : segment.raw;

        return (
          <span
            key={`${segment.key}-${index}`}
            className={cn(
              "mx-[0.08rem] inline-flex max-w-full items-center rounded-[0.45rem] border px-1 py-px align-baseline text-[0.92em] font-medium",
              accent.inlineContainer,
              accent.tagBorder,
              accent.title,
            )}
          >
            <span className="truncate">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

function getUniqueVariableKeys(content: string) {
  return Array.from(new Set(extractVariables(content)));
}

function getMessageSegments(content: string) {
  const segments: Array<
    | { type: "text"; value: string }
    | { type: "variable"; key: string; raw: string }
  > = [];
  const regex = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let lastIndex = 0;

  for (const match of content.matchAll(regex)) {
    const fullMatch = match[0];
    const key = match[1];
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      segments.push({
        type: "text",
        value: content.slice(lastIndex, startIndex),
      });
    }

    segments.push({
      type: "variable",
      key,
      raw: fullMatch,
    });
    lastIndex = startIndex + fullMatch.length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      value: content.slice(lastIndex),
    });
  }

  return segments;
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
