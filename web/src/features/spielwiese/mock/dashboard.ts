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

const defaultAgentNodes: SpielwieseDashboardVM["canvas"]["agentNodes"] = [
  {
    id: "vision-agent",
    stepLabel: "Step 1",
    title: "Vision Agent",
    description: "identifies + estimates",
    kind: "Classifier",
    settings: [
      { id: "model", label: "Model", value: "GPT-4.1 mini" },
      { id: "temperature", label: "Temperature", value: "0.1" },
      { id: "top-p", label: "Top P", value: "1.0" },
      { id: "response-format", label: "Response format", value: "json" },
      { id: "stop-sequence", label: "Stop sequence", value: "none" },
      { id: "reasoning", label: "Reasoning", value: "off / 0 tok" },
    ],
    promptSections: [
      { id: "user", label: "User", value: "[image]" },
      {
        id: "system",
        label: "Instructions",
        value:
          'You are a food identification expert. Identify every food item in the image.\nFor each item, estimate the weight in grams based on visual cues like plate size, hand, utensils, and known object references.\nReturn ONLY JSON:\n[{"item":"grilled salmon","estimated_weight_g":180}, ...]',
      },
      {
        id: "assistant",
        label: "How the assistant should reply",
        value: "[JSON]",
      },
    ],
    notes: [
      { id: "tools", value: "No tools." },
      { id: "mode", value: "Pure vision." },
      {
        id: "focus",
        value: 'This agent does ONE thing: "what is it and how much."',
      },
    ],
  },
  {
    id: "nutrition-agent",
    stepLabel: "Step 2",
    title: "Nutrition Agent",
    description: "calculates everything",
    kind: "Calculator",
    settings: [
      { id: "model", label: "Model", value: "GPT-4.1" },
      { id: "output", label: "Output", value: "macro_estimates" },
      { id: "temperature", label: "Temperature", value: "0.2" },
      { id: "top-p", label: "Top P", value: "0.9" },
      { id: "response-format", label: "Response format", value: "json" },
      { id: "stop-sequence", label: "Stop sequence", value: "none" },
      { id: "reasoning", label: "Reasoning", value: "on / 512 tok" },
    ],
    promptSections: [
      { id: "user", label: "User", value: "[JSON from Step 1]" },
      {
        id: "system",
        label: "Instructions",
        value:
          'You are a clinical nutritionist. Given food items and weights, return precise nutritional data per item and totals.\nUse USDA FoodData Central values.\nReturn ONLY JSON:\n{"items":[{"item":"grilled salmon","weight_g":180,"kcal":354,"protein_g":39.2,"carbs_g":0,"fat_g":21.6,"fiber_g":0,"vitamins":{"A_mcg":12,"D_mcg":11,"B12_mcg":5.2},"minerals":{"iron_mg":0.5,"zinc_mg":0.7},"polyphenols_mg":0}],"totals":{...}}',
      },
      {
        id: "assistant",
        label: "How the assistant should reply",
        value: "[JSON]",
      },
    ],
    notes: [
      { id: "source", value: "USDA FoodData Central" },
      { id: "scope", value: "Per item + totals" },
    ],
  },
  {
    id: "coach-agent",
    stepLabel: "Step 3",
    title: "Coach Agent",
    description: "turns data into guidance",
    kind: "Responder",
    settings: [
      { id: "model", label: "Model", value: "GPT-4o mini" },
      { id: "input", label: "Input", value: "macro_estimates" },
      { id: "output", label: "Output", value: "coach_summary" },
      { id: "temperature", label: "Temperature", value: "0.4" },
      { id: "top-p", label: "Top P", value: "0.85" },
      { id: "response-format", label: "Response format", value: "text" },
      { id: "stop-sequence", label: "Stop sequence", value: "none" },
      { id: "reasoning", label: "Reasoning", value: "off / 0 tok" },
    ],
    promptSections: [
      { id: "user", label: "User", value: "[JSON from Step 2]" },
      {
        id: "system",
        label: "Instructions",
        value:
          "You are a nutrition coach.\nTurn the nutrition JSON into a concise user-facing summary with calories, macros, and the biggest takeaways.\nKeep it short, concrete, and easy to scan.\nReturn natural language only.",
      },
      {
        id: "assistant",
        label: "How the assistant should reply",
        value: "[final summary]",
      },
    ],
    notes: [
      { id: "tools", value: "No tools." },
      {
        id: "focus",
        value:
          'This agent does ONE thing: "turn structured nutrition into clear guidance."',
      },
    ],
  },
];

const assistantCanvasAgentNodes = defaultAgentNodes.slice(0, 1);

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
      agentNodes: assistantCanvasAgentNodes,
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
      agentNodes: defaultAgentNodes,
    },
    promptCanvas: {
      title: "Vision Agent",
      sections: [
        { id: "user", label: "User", content: ["[image]"] },
        {
          id: "system",
          label: "Instructions",
          content: [
            "You are a food identification expert. Identify every food item in the image.",
            "For each item, estimate the weight in grams based on plate size, utensils, and other visible references.",
            'Return only JSON, for example: [{"item":"grilled salmon","estimated_weight_g":180}].',
          ],
        },
        {
          id: "assistant",
          label: "How the assistant should reply",
          content: ["[JSON]"],
        },
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
      agentNodes: defaultAgentNodes,
    },
    variablesPanel: defaultVariablesPanel,
    insertPanel: defaultInsertPanel,
  },
};

export const spielwieseDashboardMock: SpielwieseDashboardVM = {
  ...spielwieseDashboardMocks.assistant,
};
