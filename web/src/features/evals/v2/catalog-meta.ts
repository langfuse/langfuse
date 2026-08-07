import {
  AlertTriangle,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  Database,
  FileSearch,
  Frown,
  Gauge,
  HeartHandshake,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Scale,
  ScanSearch,
  Scissors,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

export type CatalogCategory = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tint for template icon tiles of this category. */
  iconClassName: string;
};

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    key: "quality",
    label: "Quality",
    description: "Core output quality checks for any LLM generation.",
    icon: Gauge,
    iconClassName: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  {
    key: "safety",
    label: "Safety & Security",
    description: "Catch harmful, risky, or out-of-bounds behavior.",
    icon: Shield,
    iconClassName: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  {
    key: "rag",
    label: "RAG",
    description: "Judge retrieved context and how well answers are grounded.",
    icon: FileSearch,
    iconClassName: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  },
  {
    key: "conversation",
    label: "Conversation",
    description: "Signals from multi-turn chats and agent conversations.",
    icon: MessagesSquare,
    iconClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  {
    key: "other",
    label: "Other",
    description: "Custom criteria and task-specific checks.",
    icon: Sparkles,
    iconClassName: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
];

export const getCategoryIconClasses = (categoryKey: string): string =>
  CATALOG_CATEGORIES.find((c) => c.key === categoryKey)?.iconClassName ??
  "bg-muted text-muted-foreground";

export type CatalogMeta = {
  /** Key of a CATALOG_CATEGORIES entry. */
  category: string;
  icon: LucideIcon;
  description?: string;
};

export const CATALOG_META: Record<string, CatalogMeta> = {
  // Quality
  Hallucination: {
    category: "quality",
    icon: AlertTriangle,
    description:
      "Detects claims not grounded in facts or verifiable knowledge.",
  },
  Helpfulness: {
    category: "quality",
    icon: HeartHandshake,
    description:
      "Scores how effectively and clearly the response helps the user.",
  },
  Relevance: {
    category: "quality",
    icon: Target,
    description:
      "Checks the response stays on topic and adds value to the query.",
  },
  Correctness: {
    category: "quality",
    icon: CheckCircle2,
    description: "Compares the response against ground truth facts.",
  },
  Conciseness: {
    category: "quality",
    icon: Scissors,
    description: "Scores whether the answer is direct and free of filler.",
  },
  // Safety & Security
  Toxicity: {
    category: "safety",
    icon: ShieldAlert,
    description: "Flags harmful, offensive, or disrespectful language.",
  },
  "Out-of-Scope Request": {
    category: "safety",
    icon: Shield,
    description: "Flags user requests outside the assistant's defined scope.",
  },
  // RAG
  Contextrelevance: {
    category: "rag",
    icon: FileSearch,
    description: "Scores whether retrieved context is relevant to the query.",
  },
  Contextcorrectness: {
    category: "rag",
    icon: BookOpenCheck,
    description: "Checks retrieved context against ground truth facts.",
  },
  "Answer Correctness": {
    category: "rag",
    icon: CheckCircle2,
    description: "Classifies answer statements against ground truth.",
  },
  "Answer Relevance": {
    category: "rag",
    icon: Target,
    description: "Detects vague or evasive answers via question generation.",
  },
  "Context Precision": {
    category: "rag",
    icon: ScanSearch,
    description: "Verifies retrieved context was useful for the final answer.",
  },
  "Context Recall": {
    category: "rag",
    icon: ListChecks,
    description: "Checks each answer sentence is attributable to the context.",
  },
  Faithfulness: {
    category: "rag",
    icon: BookOpenCheck,
    description: "Verifies answer statements are supported by the context.",
  },
  // Conversation
  "User Distress": {
    category: "conversation",
    icon: Frown,
    description: "Detects frustration or distress in the last user message.",
  },
  "User Disagreement": {
    category: "conversation",
    icon: MessagesSquare,
    description: "Detects when the user pushes back on the assistant's answer.",
  },
  "Goal Accuracy": {
    category: "conversation",
    icon: Gauge,
    description: "Compares the achieved outcome with the user's desired goal.",
  },
  "Topic Adherence Classification": {
    category: "conversation",
    icon: MessageSquare,
    description: "Classifies whether a topic falls within reference topics.",
  },
  "Topic Adherence Refusal": {
    category: "conversation",
    icon: Bot,
    description: "Detects whether the AI refused to answer about a topic.",
  },
  // Other
  "Answer Critic": {
    category: "other",
    icon: Scale,
    description: "Yes/no verdict on the answer against your custom criteria.",
  },
  "Simple Criteria": {
    category: "other",
    icon: ListChecks,
    description:
      "Scores the input against a single custom criteria definition.",
  },
  "SQL Semantic Equivalence": {
    category: "other",
    icon: Database,
    description:
      "Checks two SQL queries are logically equivalent for a schema.",
  },
};

export const getCatalogMeta = (name: string): CatalogMeta =>
  CATALOG_META[name] ?? { category: "other", icon: Sparkles };
