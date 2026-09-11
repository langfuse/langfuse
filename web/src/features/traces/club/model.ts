import { type TreeNode } from "../types/treeNode";
import { type MusicalFrame } from "./audio";

export const CLUB_BPM = 132;
export const CLUB_SECONDS = (64 * 4 * 60) / CLUB_BPM;
export const STEP_SECONDS = 60 / CLUB_BPM / 4;

type ClubObservation = {
  id: string;
  name: string;
  type: string;
  role: string;
  start: number;
  end: number;
  depth: number;
  weight: number;
  error: boolean;
  hue: number;
  seed: number;
  verification: boolean;
  articleLabel: string;
};

export type ClubScore = {
  duration: number;
  observations: ClubObservation[];
  seed: number;
  inscriptions: string[];
};

export type ClubFrame = MusicalFrame & {
  progress: number;
  beat: number;
  pulse: number;
  active: ClubObservation[];
  section: string;
  bureaucracy: number;
  verification: number;
  legalSeed: number;
  stageLabel: string;
  articleLabel: string;
};

const finitePositive = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

function articleLabel(name: string): string {
  const reference = name.match(
    /(?:^|[._:/\s])(?:verify|article|art)[._:/\s]+((?:[LRDA][.\s]?)?\d+(?:-\d+)*)(?=$|[._:/\s])/i,
  )?.[1];
  return reference
    ? `ARTICLE ${reference.replace(/[.\s]/g, "").toUpperCase()}`
    : "";
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

/** Compile names, timing, topology and usage; input/output payloads stay out. */
export function prepareClubScore(
  roots: TreeNode[],
  origin: Date,
  duration: number,
  traceId: string,
): ClubScore {
  const observations: ClubObservation[] = [];
  const safeDuration = finitePositive(duration);
  const pending = [...roots];
  while (pending.length) {
    const node = pending.pop()!;
    pending.push(...node.children);
    if (node.type === "TRACE") continue;
    const start = Math.max(
      0,
      (node.startTime.getTime() - origin.getTime()) / 1000,
    );
    if (!Number.isFinite(start)) continue;
    // Agentique's native v3 sink records its Légifrance tools as named spans.
    const type =
      node.type === "SPAN" && node.name.startsWith("legifrance.")
        ? "TOOL"
        : node.type;
    const measuredEnd =
      ((node.endTime ?? node.startTime).getTime() - origin.getTime()) / 1000;
    const seed = hash(node.id);
    observations.push({
      id: node.id,
      name: node.name,
      type: node.type,
      role: type,
      start,
      end: Math.max(
        start + (safeDuration / CLUB_SECONDS) * 0.18,
        Number.isFinite(measuredEnd) ? measuredEnd : start,
      ),
      depth: Math.min(64, finitePositive(node.depth)),
      weight: Math.min(
        1,
        Math.log10(1 + finitePositive(node.totalUsage ?? 0)) / 5,
      ),
      error: node.level === "ERROR" || node.level === "WARNING",
      hue: type === "GENERATION" ? 270 : type === "TOOL" ? 165 : 42,
      seed,
      verification:
        /(?:^|[._:/-])(?:verify|verification|check|validate|validation)(?:$|[._:/-])/i.test(
          node.name,
        ),
      articleLabel: articleLabel(node.name),
    });
  }
  observations.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return {
    duration: safeDuration,
    observations,
    seed: hash(traceId),
    inscriptions: [
      ...new Set(
        observations.flatMap((node) =>
          [
            node.articleLabel,
            node.name.replace(/\s+/g, " ").trim().slice(0, 96),
          ].filter(Boolean),
        ),
      ),
    ],
  };
}

export function sampleClubScore(score: ClubScore, seconds: number): ClubFrame {
  const position = finitePositive(seconds);
  const progress =
    score.duration > 0 ? Math.min(1, position / score.duration) : 0;
  const active = score.observations.filter(
    (node) => node.start <= position && node.end >= position,
  );
  const generations = active.filter((node) => node.role === "GENERATION");
  const tools = active.filter((node) => node.role === "TOOL");
  const checks = active.filter((node) => node.verification);
  const procedures = active.filter(
    (node) => node.role === "TOOL" || node.verification,
  );
  // The preceding eight musical beats expose bursts and repeated requests even
  // when individual tools finish between rendered frames.
  const memory = Math.max(
    0.001,
    (score.duration / CLUB_SECONDS) * (60 / CLUB_BPM) * 8,
  );
  const recentNames = new Set<string>();
  let recentLoad = 0;
  let repeatLoad = 0;
  for (const node of score.observations) {
    const age = position - node.start;
    if (
      age < 0 ||
      age >= memory ||
      (node.role !== "TOOL" && !node.verification)
    ) {
      continue;
    }
    const weight = 1 - age / memory;
    recentLoad += weight;
    if (recentNames.has(node.name)) repeatLoad += weight;
    recentNames.add(node.name);
  }
  const depth = active.reduce((max, node) => Math.max(max, node.depth), 0);
  const beat = (progress * CLUB_SECONDS * CLUB_BPM) / 60;
  const energy = Math.min(
    1,
    active.length / 9 + active.reduce((sum, node) => sum + node.weight, 0) / 12,
  );
  return {
    progress,
    beat,
    pulse: Math.exp(-((beat % 1) * 7)),
    active,
    energy,
    depth,
    tension: active.some((node) => node.error) ? 1 : Math.min(0.8, depth / 10),
    generation: Math.min(1, generations.length / 3),
    tool: Math.min(1, tools.length / 3),
    seed: active[active.length - 1]?.seed ?? score.seed,
    bureaucracy: Math.min(
      1,
      procedures.length / 5 + recentLoad / 8 + repeatLoad / 6,
    ),
    verification: Math.min(1, checks.length / 3),
    legalSeed: score.seed,
    stageLabel: checks.length
      ? "CONTRÔLE"
      : tools.length ||
          active.some((node) => /(?:^|[._])research$/.test(node.name))
        ? "RECHERCHE"
        : generations.length ||
            active.some((node) =>
              /(?:^|[._])(?:compose|skeptic|teach)$/.test(node.name),
            )
          ? "DÉLIBÉRATION"
          : active.length || !progress
            ? "SAISINE"
            : "ARCHIVES",
    articleLabel:
      active.findLast((node) => node.articleLabel)?.articleLabel ?? "",
    section:
      progress < 0.125
        ? "01 / ARRIVAL"
        : progress < 0.375
          ? "02 / PRESSURE"
          : progress < 0.5
            ? "03 / SUSPENSION"
            : progress < 0.875
              ? "04 / RELEASE"
              : "05 / AFTERGLOW",
  };
}

/** Six-channel RGBWAUV wash, without a strobe or a master-dimmer channel. */
export function roomChannels(frame: ClubFrame, brightness: number): number[] {
  const level = Math.max(0, Math.min(1, brightness));
  const pulse = 0.3 + frame.pulse * 0.7;
  return [
    (35 +
      frame.tension * 150 +
      frame.generation * 90 +
      frame.bureaucracy * 50) *
      pulse,
    (20 + frame.tool * 170 + frame.verification * 100) * pulse,
    (95 + frame.generation * 140 + frame.verification * 65) * pulse,
    frame.energy * frame.pulse * 26,
    (20 + frame.energy * 42 + frame.bureaucracy * 70) * pulse,
    0,
  ].map((channel) => Math.round(Math.min(255, channel) * level));
}
