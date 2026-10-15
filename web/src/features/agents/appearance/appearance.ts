export const AGENT_COLORS = [
  { name: "Slate", value: "#94a3b8" },
  { name: "Indigo", value: "#818cf8" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Emerald", value: "#34d399" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Orange", value: "#fb923c" },
  { name: "Rose", value: "#fb7185" },
  { name: "Violet", value: "#c084fc" },
] as const;

export const AGENT_ICON_IDS = [
  "bot",
  "sparkles",
  "brain",
  "compass",
  "search",
  "shield",
  "pen",
  "code",
  "rocket",
  "workflow",
  "flask",
  "book",
  "globe",
  "terminal",
  "lightbulb",
  "message",
  "puzzle",
  "wand",
  "layers",
  "target",
  "heart",
  "star",
  "zap",
  "database",
  "cloud",
  "chart",
  "key",
  "briefcase",
  "graduation",
  "music",
  "coffee",
  "leaf",
  "sun",
  "moon",
  "mountain",
  "gem",
  "cat",
  "dog",
  "bird",
  "rabbit",
  "fish",
  "bug",
  "turtle",
  "squirrel",
  "shell",
  "ghost",
  "octagon",
  "cube",
] as const;
export type AgentIconId = (typeof AGENT_ICON_IDS)[number];
export const AGENT_MASCOTS: AgentIconId[] = [
  "bot",
  "cat",
  "dog",
  "bird",
  "rabbit",
  "fish",
  "bug",
  "turtle",
  "squirrel",
  "ghost",
];
export type AgentAppearance = {
  color: string;
  glyph:
    | { kind: "icon"; id: AgentIconId }
    | { kind: "mascot"; id: AgentIconId }
    | { kind: "emoji"; value: string };
};

export function agentAppearanceKey(
  projectId: string,
  agentName: string,
): string {
  return JSON.stringify([projectId, agentName]);
}

export function defaultAgentAppearance(
  projectId: string,
  agentName: string,
): AgentAppearance {
  let hash = 2166136261;
  for (const point of agentAppearanceKey(projectId, agentName)) {
    hash = Math.imul(hash ^ (point.codePointAt(0) ?? 0), 16777619);
  }
  const index = hash >>> 0;
  return {
    color: AGENT_COLORS[index % AGENT_COLORS.length].value,
    glyph: { kind: "icon", id: AGENT_ICON_IDS[index % 24] },
  };
}

export function parseAgentAppearance(value: unknown): AgentAppearance | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.color !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(candidate.color)
  )
    return null;
  if (!candidate.glyph || typeof candidate.glyph !== "object") return null;
  const glyph = candidate.glyph as Record<string, unknown>;
  if (
    (glyph.kind === "icon" || glyph.kind === "mascot") &&
    typeof glyph.id === "string" &&
    AGENT_ICON_IDS.some((id) => id === glyph.id)
  ) {
    return {
      color: candidate.color.toLowerCase(),
      glyph: { kind: glyph.kind, id: glyph.id as AgentIconId },
    };
  }
  if (
    glyph.kind === "emoji" &&
    typeof glyph.value === "string" &&
    glyph.value.length <= 32 &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(glyph.value) &&
    Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        glyph.value,
      ),
    ).length === 1
  ) {
    return {
      color: candidate.color.toLowerCase(),
      glyph: { kind: "emoji", value: glyph.value },
    };
  }
  return null;
}
