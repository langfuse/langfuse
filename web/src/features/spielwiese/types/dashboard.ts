import type { LucideIcon } from "lucide-react";

export type SpielwieseCanvasStatVM = {
  id: string;
  label: string;
  value: string;
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

export type SpielwieseDashboardVM = {
  pageId: string;
  header: {
    breadcrumb: string;
    title: string;
    updatedAt: string;
  };
  canvas: {
    title: string;
    helper: string;
    stats: SpielwieseCanvasStatVM[];
  };
  promptCanvas?: {
    title: string;
    sections: SpielwiesePromptSectionVM[];
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
