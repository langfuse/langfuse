import type { LucideIcon } from "lucide-react";

export type SpielwieseCanvasStatVM = {
  id: string;
  label: string;
  value: string;
};

export type SpielwieseAgentNodeSettingVM = {
  id: string;
  label: string;
  value: string;
};

export type SpielwieseAgentNodePromptSectionKind =
  | "user"
  | "system"
  | "assistant"
  | "tool";

export type SpielwieseAgentNodePromptSectionVM = {
  id: string;
  label: string;
  value: string;
};

export type SpielwieseAgentNodeNoteVM = {
  id: string;
  value: string;
};

export type SpielwieseAgentNodeThinkingStepVM = {
  id: string;
  label: string;
  value: string;
};

export type SpielwieseAgentNodeThinkingVM = {
  summary: string;
  title: string;
  steps: SpielwieseAgentNodeThinkingStepVM[];
};

export type SpielwieseAgentNodePlaygroundPreviewVM = {
  format: "json" | "text";
  label: string;
  toneSectionId?: string;
  value: string;
};

export type SpielwieseAgentNodeLayout =
  | "composite"
  | "user-only"
  | "agent-only";

export type SpielwieseAgentNodeVM = {
  id: string;
  stepLabel: string;
  title: string;
  description: string;
  kind: string;
  layout?: SpielwieseAgentNodeLayout;
  settings: SpielwieseAgentNodeSettingVM[];
  promptSections: SpielwieseAgentNodePromptSectionVM[];
  notes: SpielwieseAgentNodeNoteVM[];
  playgroundThinking?: SpielwieseAgentNodeThinkingVM;
  playgroundPreview?: SpielwieseAgentNodePlaygroundPreviewVM;
};

export type SpielwiesePromptSectionVM = {
  id: string;
  label: string;
  content: string[];
};

export type SpielwieseInsertItemVM = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export type SpielwieseLinePresetVM = {
  id: string;
  label: string;
  style: "dots" | "dash" | "split" | "solid";
};

export type SpielwieseVariableVM = {
  id: string;
  label: string;
  helper: string;
  isActive?: boolean;
  tone: "blue" | "green" | "yellow";
};

export type SpielwieseDashboardVM = {
  pageId: string;
  header: {
    breadcrumb: string;
    title: string;
    updatedAt: string;
  };
  onboardingCanvas?: {
    greeting: string;
  };
  canvas: {
    title: string;
    helper: string;
    stats: SpielwieseCanvasStatVM[];
    agentNodes: SpielwieseAgentNodeVM[];
  };
  promptCanvas?: {
    title: string;
    sections: SpielwiesePromptSectionVM[];
  };
  variablesPanel: {
    countLabel: string;
    actionLabel: string;
    items: SpielwieseVariableVM[];
  };
  insertPanel: {
    tabs: string[];
    activeTab: string;
    description: string;
    items: SpielwieseInsertItemVM[];
    linePresets: SpielwieseLinePresetVM[];
    pageBreakLabel: string;
    table: {
      rows: number;
      columns: number;
      selectedRows: number;
      selectedColumns: number;
      helper: string;
      footerLabel: string;
    };
  };
};
