import {
  Braces,
  File,
  FileText,
  Folder,
  ImageIcon,
  Images,
  LayoutGrid,
  PanelTop,
  ScanText,
  Sigma,
} from "lucide-react";
import type { SpielwieseDashboardVM } from "../types/dashboard";

const defaultInsertPanel: SpielwieseDashboardVM["insertPanel"] = {
  tabs: ["Insert", "Format", "Style", "Info"],
  activeTab: "Insert",
  description: "Drag and drop any item to the document.",
  items: [
    { id: "text", label: "Text", icon: ScanText },
    { id: "page", label: "Page", icon: FileText },
    { id: "card", label: "Card", icon: LayoutGrid },
    { id: "file", label: "File Attachment", icon: File },
    { id: "image", label: "Image", icon: ImageIcon },
    { id: "unsplash", label: "Image from Unsplash", icon: Images },
    { id: "code", label: "Code Block", icon: Braces },
    { id: "whiteboard", label: "Whiteboard", icon: PanelTop },
    { id: "formula", label: "Tex Formula", icon: Sigma },
    { id: "collection", label: "Collection", icon: Folder },
  ],
  linePresets: [
    { id: "dots", label: "Insert dotted line", style: "dots" },
    { id: "dash", label: "Insert dashed line", style: "dash" },
    { id: "split", label: "Insert split line", style: "split" },
    { id: "solid", label: "Insert solid line", style: "solid" },
  ],
  pageBreakLabel: "Insert Page Break",
  table: {
    rows: 4,
    columns: 6,
    selectedRows: 2,
    selectedColumns: 3,
    helper: "Insert a table with the highlighted number of rows and columns.",
    footerLabel: "Assistant",
  },
};

const defaultVariablesPanel: SpielwieseDashboardVM["variablesPanel"] = {
  countLabel: "3 variables",
  actionLabel: "Add variable",
  items: [
    {
      id: "food",
      label: "Food",
      helper: "This is about food.",
      isActive: true,
      tone: "green",
    },
    {
      id: "cuisine",
      label: "Cuisine",
      helper: "Click to edit...",
      tone: "yellow",
    },
    {
      id: "source",
      label: "Source",
      helper: "Click to edit...",
      tone: "blue",
    },
  ],
};

export const spielwieseDashboardMocks: Record<string, SpielwieseDashboardVM> = {
  assistant: {
    pageId: "assistant",
    header: {
      breadcrumb: "Macroextractor / Assistant",
      title: "Assistant",
      updatedAt: "02m",
    },
    onboardingCanvas: {
      greeting: "Hello Leonard",
    },
    canvas: {
      title: "Assistant",
      helper:
        "Start from a blank page, then drop in structure block by block as the layout sharpens.",
      stats: [
        { id: "blocks", label: "Blocks", value: "01" },
        { id: "links", label: "Linked pages", value: "00" },
        { id: "comments", label: "Comments", value: "03" },
      ],
    },
    variablesPanel: defaultVariablesPanel,
    insertPanel: defaultInsertPanel,
  },
  "vision-agent": {
    pageId: "vision-agent",
    header: {
      breadcrumb: "Macroextractor / Vision Agent",
      title: "Vision Agent",
      updatedAt: "05m",
    },
    canvas: {
      title: "Vision Agent",
      helper:
        "Review the image-analysis prompt as a structured handoff before turning it into a reusable workflow.",
      stats: [
        { id: "messages", label: "Messages", value: "03" },
        { id: "attachments", label: "Attachments", value: "01" },
        { id: "outputs", label: "Outputs", value: "01" },
      ],
    },
    promptCanvas: {
      title: "Vision Agent",
      sections: [
        { id: "user", label: "User", content: ["[image]"] },
        {
          id: "system",
          label: "System",
          content: [
            "You are a food identification expert. Identify every food item in the image.",
            "For each item, estimate the weight in grams based on plate size, utensils, and other visible references.",
            'Return only JSON, for example: [{"item":"grilled salmon","estimated_weight_g":180}].',
          ],
        },
        { id: "assistant", label: "Assistant", content: ["[JSON]"] },
      ],
    },
    variablesPanel: defaultVariablesPanel,
    insertPanel: defaultInsertPanel,
  },
  "nutrition-agent": {
    pageId: "nutrition-agent",
    header: {
      breadcrumb: "Macroextractor / Nutrition Agent",
      title: "Nutrition Agent",
      updatedAt: "07m",
    },
    canvas: {
      title: "Nutrition Agent",
      helper:
        "Take the detected foods and convert them into nutrition facts, assumptions, and confidence notes.",
      stats: [
        { id: "blocks", label: "Blocks", value: "02" },
        { id: "inputs", label: "Inputs", value: "01" },
        { id: "outputs", label: "Outputs", value: "01" },
      ],
    },
    variablesPanel: defaultVariablesPanel,
    insertPanel: defaultInsertPanel,
  },
};

export const spielwieseDashboardMock: SpielwieseDashboardVM = {
  ...spielwieseDashboardMocks.assistant,
};
