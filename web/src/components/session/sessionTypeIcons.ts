import {
  Bot,
  CircleDot,
  Fan,
  Layers3,
  Link,
  MoveHorizontal,
  Search,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Observation-type icon treatment of the v4 session design: agent purple,
 * tool orange, generation pink (exact handoff values, with brightened dark
 * variants so they read on dark surfaces); every other type stays neutral.
 */
const TYPE_ICONS: Record<string, { Icon: LucideIcon; className: string }> = {
  GENERATION: { Icon: Fan, className: "text-session-generation" },
  TOOL: { Icon: Wrench, className: "text-session-tool" },
  AGENT: { Icon: Bot, className: "text-session-agent" },
  SPAN: { Icon: MoveHorizontal, className: "text-muted-foreground" },
  EVENT: { Icon: CircleDot, className: "text-muted-foreground" },
  CHAIN: { Icon: Link, className: "text-muted-foreground" },
  RETRIEVER: { Icon: Search, className: "text-muted-foreground" },
  EMBEDDING: { Icon: Layers3, className: "text-muted-foreground" },
  GUARDRAIL: { Icon: ShieldCheck, className: "text-muted-foreground" },
};

export const observationTypeIcon = (
  type: string | null | undefined,
): { Icon: LucideIcon; className: string } =>
  TYPE_ICONS[type ?? ""] ?? {
    Icon: MoveHorizontal,
    className: "text-muted-foreground",
  };
