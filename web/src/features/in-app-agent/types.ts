import {
  type IN_APP_AGENT_MESSAGE_ENTRY_POINTS,
  type IN_APP_AGENT_QUICK_ACTION_CONTEXTS,
} from "@/src/features/in-app-agent/constants";
import { type LucideIcon } from "lucide-react";

export type InAppAgentToolCallContent = {
  type: "tool";
  name: string;
  args: string;
  status: "running" | "succeeded" | "failed" | "denied";
  result?: string;
  error?: string;
  approval?: {
    id: string;
    status: "pending" | "submitting";
  };
};

export type InAppAgentError =
  | { type: "generic"; message: string }
  | { type: "rate_limit"; retryAt: number };

export type InAppAgentMessageEntryPoint =
  (typeof IN_APP_AGENT_MESSAGE_ENTRY_POINTS)[number];

export type InAppAgentScreenContextDescription =
  | { type: "page" }
  | { type: "observation" }
  | { type: "trace" }
  | {
      type: "prompt";
      name: string;
      selector?:
        | { type: "version"; value: string }
        | { type: "label"; value: string };
    }
  | { type: "session"; id: string }
  | { type: "dataset" }
  | { type: "datasetItem" }
  | { type: "experimentRun" }
  | { type: "trace-list"; hasAppliedFilters: boolean }
  | { type: "observations-list"; hasAppliedFilters: boolean }
  | { type: "sessions-list"; hasAppliedFilters: boolean }
  | { type: "prompts-list"; hasAppliedFilters: boolean }
  | { type: "datasets-list"; hasAppliedFilters: boolean };

export type InAppAgentQuickActionContext =
  (typeof IN_APP_AGENT_QUICK_ACTION_CONTEXTS)[number];

export type InAppAgentQuickAction = {
  id: string;
  label: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
};

export type InAppAgentQuickActionAttribution = {
  key: string;
  category: InAppAgentQuickActionContext;
};

export type InAppAgentSubmitOptions = {
  quickAction?: InAppAgentQuickActionAttribution;
  /** Force a fresh conversation instead of appending to the selected one. */
  newConversation?: boolean;
  /** Which surface sent the message; telemetry only (PostHog + trace
   * metadata), never shown to the agent. Defaults to "chat". */
  entryPoint?: InAppAgentMessageEntryPoint;
};
