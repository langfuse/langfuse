import { useEffect, useState } from "react";
import {
  clamp01,
  project,
} from "@/src/components/illustrations/engine/projection";
import {
  GRID,
  PILE,
  PILE_COLORS,
  PLANE,
  SHEET,
  sheetStrengths,
  tint,
  type PileColor,
} from "./topic-piles-geometry";
import { TopicPilesScene } from "./TopicPilesScene";

// The drawing's box in css px, centred on the three footprints.
const BOX = { width: 720, height: 480 };
const MIDDLE = { x: 306, y: -36 };
// One trace card, and the square footprint a finished cluster gets.
const CARD = { width: 72, depth: 36, corner: 3 };
const MAT = 144;
const NAME_FONT_SIZE = 16.5;
const COUNT_FONT_SIZE = 19.5;
// Where a trace waits before it rises: touching its pile's left, right or back side.
const DOCK = {
  left: { x: -CARD.width, y: 0 },
  right: { x: CARD.width, y: 0 },
  back: { x: 0, y: -CARD.depth },
};

// Seconds. One loop: loose traces join their piles one by one, the finished picture holds, then fades back to loose.
const LOOP = 10;
// The finished picture: where the loop starts, and all that shows without motion.
const REST = 7.2;
const LANDING = { first: 1.8, every: 0.3 };
const NAMES_FADE_IN = 0.4;
// The return: names fade, then the piles fade out while the loose traces fade in.
const RETURN = {
  at: 8.5,
  namesFor: 0.35,
  pilesFrom: 0.1,
  pilesFor: 0.6,
  looseFrom: 0.4,
  looseFor: 0.65,
};
// A trace's way onto its pile, in seconds before it lands: slide to its dock, rise, move over, set down.
const HOP = {
  clear: 16,
  slideBase: 0.35,
  slideSpeed: 800,
  slideEnds: 0.7,
  riseFrom: 0.78,
  riseFor: 0.3,
  overFrom: 0.54,
  overFor: 0.34,
  downFrom: 0.24,
};

// The loose traces in the order they land: where each lies, its pile, the side it docks on, its text line's length.
const LOOSE = [
  { x: -144, y: 54, pile: 0, from: "left", line: 30 },
  { x: 522, y: 324, pile: 1, from: "right", line: 42 },
  { x: 306, y: -162, pile: 0, from: "back", line: 24 },
  { x: 630, y: 162, pile: 2, from: "right", line: 36 },
  { x: 324, y: 180, pile: 0, from: "right", line: 48 },
  { x: 612, y: -90, pile: 1, from: "back", line: 30 },
  { x: -54, y: -144, pile: 0, from: "left", line: 36 },
  { x: 324, y: 342, pile: 0, from: "right", line: 24 },
  { x: 486, y: -126, pile: 1, from: "back", line: 42 },
  { x: 126, y: -216, pile: 0, from: "right", line: 30 },
  { x: -36, y: 198, pile: 0, from: "left", line: 48 },
  { x: 108, y: 198, pile: 0, from: "right", line: 36 },
] as const;
// The text line of the trace that already lies where each pile forms.
const FIRST_LINES = [36, 30, 42] as const;

const TRACES = layoutTraces();
const PILES = FIRST_LINES.map((line, pile) => {
  const joining = TRACES.filter((trace) => trace.pile === pile);
  return {
    ...spotOf(pile),
    id: `pile-${pile}`,
    color: PILE_COLORS[pile % PILE_COLORS.length],
    joining,
    lines: [line, ...joining.map((trace) => trace.line)],
    strengths: sheetStrengths(joining.length + 1),
    doneAt: Math.max(...joining.map((trace) => trace.landsAt)),
  };
});
const EDGES = {
  xs: PILES.flatMap((_, pile) => [pile * PILE.pitch, pile * PILE.pitch + MAT]),
  ys: [0, MAT],
};
// The finished picture stands still from the last name's fade-in until the return.
const STILL_FROM =
  Math.max(...PILES.map((pile) => pile.doneAt)) + NAMES_FADE_IN;

/** Decorative: loose grey traces gather into three coloured piles; a finished pile gets a footprint with its name and count. */
export function TopicClustersIllustration({
  piles,
}: TopicClustersIllustrationProps) {
  const seconds = useLoopSeconds();
  const returning = seconds - RETURN.at;
  const sorted = 1 - smooth((returning - RETURN.pilesFrom) / RETURN.pilesFor);
  const loose = smooth((returning - RETURN.looseFrom) / RETURN.looseFor);
  const named = PILES.map(
    (pile) =>
      smooth((seconds - pile.doneAt) / NAMES_FADE_IN) *
      (1 - smooth(returning / RETURN.namesFor)),
  );
  const allNamed = Math.min(...named);
  return (
    <TopicPilesScene
      box={BOX}
      middle={MIDDLE}
      drop={0}
      edges={EDGES}
      edgeOpacity={{
        xs: named.flatMap((opacity) => [opacity, opacity]),
        ys: [allNamed, allNamed],
      }}
    >
      <g transform={PLANE}>
        {piles.slice(0, PILES.length).map((pile, index) => (
          <Footprint
            key={pile.name}
            pile={pile}
            x={index * PILE.pitch}
            color={PILE_COLORS[index % PILE_COLORS.length]}
            opacity={named[index]}
          />
        ))}
      </g>
      <g opacity={sorted}>
        <Stacks stacks={stacksAt(Math.min(seconds, RETURN.at))} />
      </g>
      {loose > 0 ? (
        <g opacity={loose}>
          <Stacks stacks={stacksAt(0)} />
        </g>
      ) : null}
    </TopicPilesScene>
  );
}

/** Seconds into the loop, counted every frame from the finished picture; stays there on the server and whenever reduced motion is on. */
function useLoopSeconds() {
  const [seconds, setSeconds] = useState(REST);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const play = () => {
      if (reduced.matches) return;
      const startedAt = performance.now();
      frame = requestAnimationFrame(function tick(now) {
        const at = (REST + Math.max(0, now - startedAt) / 1000) % LOOP;
        // One value for the whole still stretch, so its frames do not render.
        setSeconds(at >= STILL_FROM && at < RETURN.at ? REST : at);
        frame = requestAnimationFrame(tick);
      });
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      setSeconds(REST);
      play();
    };
    play();
    reduced.addEventListener("change", restart);
    return () => {
      reduced.removeEventListener("change", restart);
      cancelAnimationFrame(frame);
    };
  }, []);
  return seconds;
}

/** Where pile number `pile` stands: one square in from the corner of its footprint. */
function spotOf(pile: number) {
  return { x: pile * PILE.pitch + GRID, y: GRID };
}

/** Each loose trace with its place in its pile, the dock it slides to, and when it slides and lands. */
function layoutTraces() {
  const levels = new Map<number, number>();
  return LOOSE.map((trace, index) => {
    const spot = spotOf(trace.pile);
    const level = (levels.get(trace.pile) ?? 0) + 1;
    levels.set(trace.pile, level);
    const dock = {
      x: spot.x + DOCK[trace.from].x,
      y: spot.y + DOCK[trace.from].y,
    };
    return {
      ...trace,
      id: `trace-${index}`,
      spot,
      dock,
      level,
      landsAt: LANDING.first + index * LANDING.every,
      slidesFor:
        HOP.slideBase +
        Math.hypot(dock.x - trace.x, dock.y - trace.y) / HOP.slideSpeed,
    };
  });
}

/** Every stack `seconds` into the sorting, back to front: the three piles and each trace that has not landed yet. */
function stacksAt(seconds: number): StackState[] {
  const piles = PILES.map((pile) => {
    const sheets =
      1 + pile.joining.filter((trace) => trace.landsAt <= seconds).length;
    // The trace that lay here first takes its colour as its first neighbour lands.
    const colored = hopAt(pile.joining[0], seconds).colored;
    return {
      id: pile.id,
      x: pile.x,
      y: pile.y,
      base: 0,
      color: pile.color,
      colored,
      strengths: pile.strengths
        .slice(0, sheets)
        .map((strength) => mix(100, strength, colored)),
      line: pile.lines[sheets - 1],
      depth: depthOf(pile),
    };
  });
  const traces = TRACES.filter((trace) => trace.landsAt > seconds).map(
    (trace) => {
      const hop = hopAt(trace, seconds);
      const pile = piles[trace.pile];
      const isAbovePile = hop.base >= pile.strengths.length * SHEET.height;
      return {
        id: trace.id,
        ...hop,
        color: pile.color,
        strengths: [
          mix(100, PILES[trace.pile].strengths[trace.level], hop.colored),
        ],
        line: trace.line,
        // A trace that has risen above its pile is drawn after it.
        depth: isAbovePile
          ? Math.max(depthOf(hop), pile.depth + trace.level / 100)
          : depthOf(hop),
      };
    },
  );
  return [...piles, ...traces].sort((a, b) => a.depth - b.depth);
}

/** A trace on its way: slides to its dock, rises straight up, moves over the pile and sets down, taking its colour. */
function hopAt(trace: (typeof TRACES)[number], seconds: number) {
  const before = trace.landsAt - seconds;
  const slid = smooth(1 - (before - HOP.slideEnds) / trace.slidesFor);
  const risen = smooth((HOP.riseFrom - before) / HOP.riseFor);
  const over = smooth((HOP.overFrom - before) / HOP.overFor);
  const down = smooth((HOP.downFrom - before) / HOP.downFrom);
  return {
    x: mix(mix(trace.x, trace.dock.x, slid), trace.spot.x, over),
    y: mix(mix(trace.y, trace.dock.y, slid), trace.spot.y, over),
    base: risen * (trace.level * SHEET.height + HOP.clear) - down * HOP.clear,
    colored: smooth((HOP.overFrom - before) / HOP.overFrom),
  };
}

/** Nearer the viewer is larger: the screen height of a card's middle on the floor. */
function depthOf({ x, y }: Spot) {
  return project([x + CARD.width / 2, y + CARD.depth / 2])[1];
}

function smooth(share: number) {
  const s = clamp01(share);
  return s * s * (3 - 2 * s);
}

function mix(from: number, to: number, share: number) {
  return from + (to - from) * share;
}

/** Stacks of trace cards, drawn in the given order; the top card of each shows a faint text line. */
function Stacks({ stacks }: StacksProps) {
  return stacks.map((stack) => (
    <TopicPilesScene.Stack
      key={stack.id}
      rect={{
        x: stack.x,
        y: stack.y,
        width: CARD.width,
        depth: CARD.depth,
      }}
      base={stack.base}
      corner={CARD.corner}
      strengths={stack.strengths}
      color={stack.color}
      colored={stack.colored}
      line={stack.line}
    />
  ));
}

/** A finished cluster's mark on the floor: a tinted square under the pile, with its name and count in front of it. */
function Footprint({ pile, x, color, opacity }: FootprintProps) {
  return (
    <g opacity={opacity}>
      <rect
        x={x}
        y={0}
        width={MAT}
        height={MAT}
        rx={2}
        strokeWidth={1.5}
        className="stroke-border-contrast"
        style={{ fill: tint(color, 12, "background") }}
      />
      <text
        x={x + MAT / 2}
        y={99}
        textAnchor="middle"
        fontSize={NAME_FONT_SIZE}
        className="fill-muted-foreground"
      >
        {pile.name}
      </text>
      <text
        x={x + MAT / 2}
        y={125}
        textAnchor="middle"
        fontSize={COUNT_FONT_SIZE}
        className="fill-foreground"
      >
        {pile.count}
      </text>
    </g>
  );
}

type Spot = { x: number; y: number };

type StackState = Spot & {
  id: string;
  /** How far its bottom sheet is off the floor. */
  base: number;
  color: PileColor;
  /** 0 while grey, 1 once it has its pile's colour. */
  colored: number;
  strengths: number[];
  /** Length of the text line on its top card. */
  line: number;
  depth: number;
};

type StacksProps = { stacks: StackState[] };

type TopicClustersIllustrationProps = {
  /** Three topics, left to right; the fifteen traces gather 9, 4 and 2 to a pile. */
  piles: readonly { name: string; count: number }[];
};

type FootprintProps = {
  pile: TopicClustersIllustrationProps["piles"][number];
  /** Left edge on the floor. */
  x: number;
  color: PileColor;
  opacity: number;
};
