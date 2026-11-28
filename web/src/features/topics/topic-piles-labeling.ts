import {
  clamp01,
  round,
} from "@/src/components/illustrations/engine/projection";
import { GRID, SHEET } from "./topic-piles-geometry";

/** Floor units of the labeling drawing: a trace card is also a pile's footprint, and the piles stand in a row at y 0. */
export const CARD = { width: 144, depth: 72 };
export const PILE_PITCH = 216;
/** The square where a trace is read; the unread ones wait in a row in front of it. */
export const READING = { x: -108, y: 144 };
const QUEUE = { y: 252, pitch: 180, slots: 3.5 };
// Labeled cards are carried along the aisle between the reading square and the piles, at least CARRY high.
const AISLE = CARD.depth;
const CARRY = 2 * SHEET.height;

// Seconds a card takes to reach the reading square, rest there and fly to the nearest pile; later cards keep the last pace.
const PACE = [
  { approach: 0.28, rest: 0.36, flight: 0.42 },
  { approach: 0.28, rest: 0.36, flight: 0.42 },
  { approach: 0.28, rest: 0.36, flight: 0.42 },
  { approach: 0.26, rest: 0.26, flight: 0.4 },
  { approach: 0.22, rest: 0.18, flight: 0.36 },
  { approach: 0.2, rest: 0.13, flight: 0.34 },
  { approach: 0.18, rest: 0.11, flight: 0.34 },
] as const;
const FASTEST = PACE[PACE.length - 1];
// Seconds before the first card moves, for labels to turn into names, on the final frame, and for the queue to return.
const LEAD = 0.2;
const NAMING = 0.5;
const HOLD = 2.5;
const RETURN = 0.6;
// Seconds the floor lines take to fade before the sorted piles move, and the piles take to reach the middle of the box.
const CLEAR = 0.15;
const SLIDE = 0.85;
// Floor units from the pile slots to the middle of the box: whole grid squares, so the piles' edges stay on grid lines.
const TO_MIDDLE = { x: -GRID, y: 3 * GRID };

/** When each trace is read and lands, and the loop around them. */
export function labelingTimeline(traces: readonly LabeledTrace[]) {
  const cards: Card[] = [];
  // A card starts toward the reading square as the one ahead steps back from it, so two never share the square.
  let starts = LEAD;
  traces.forEach((trace, index) => {
    const pace = PACE[index] ?? FASTEST;
    const arrives = starts + pace.approach;
    const leaves = arrives + pace.rest;
    cards.push({
      index,
      topic: trace.topic,
      letters: trace.intent.join("").length,
      starts,
      arrives,
      leaves,
      lands: leaves + pace.flight * (1 + 0.25 * trace.topic),
      below: cards.filter((card) => card.topic === trace.topic).length,
    });
    starts = leaves;
  });
  const sorted = Math.max(LEAD, ...cards.map((card) => card.lands)) + 0.05;
  const slides = sorted + CLEAR;
  const named = slides + SLIDE;
  const returns = named + NAMING + HOLD;
  return {
    cards,
    /** When every card is on its pile, when the piles leave their slots, and when they stand in the middle and take their names. */
    sorted,
    slides,
    named,
    returns,
    loop: returns + RETURN,
    /** A moment on the final frame, shortly before the loop starts over. */
    still: returns - 1,
  };
}

/** Where everything is `seconds` into the loop; `cards` are in paint order. */
export function labelingFrame(
  timeline: LabelingTimeline,
  seconds: number,
  topics: number,
) {
  const { cards, slides, named, returns, loop } = timeline;
  const back = ease((seconds - returns) / (loop - returns));
  const lastLeaves = cards.at(-1)?.leaves ?? 0;
  const slid = ease((seconds - slides) / (named - slides));
  return {
    /** 0 until the loop starts over, 1 when it has. */
    back,
    /** How visible the reading square is. */
    square: Math.max(back, 1 - ease((seconds - lastLeaves) / 0.4)),
    piles: pileFrames(cards, seconds, topics, back),
    /** Floor units the sorted piles have moved from their slots toward the middle of the box. */
    slide: { x: TO_MIDDLE.x * slid, y: TO_MIDDLE.y * slid },
    /** The darker floor lines along the piles' edges: the floor units they are moved by and how visible they are. */
    lines: floorLines(timeline, seconds, back),
    /** How visible the top cards' own labels and the topics' names are. */
    intents: 1 - ease((seconds - named) / 0.25),
    names: ease((seconds - named - 0.1) / 0.35),
    cards: cardFrames(cards, seconds, back),
  };
}

// Each topic's pile: the sheets landed so far, the card on top, and how visible its empty spot is.
function pileFrames(
  cards: readonly Card[],
  seconds: number,
  topics: number,
  back: number,
) {
  return Array.from({ length: topics }, (_, topic) => {
    const landed = cards.filter(
      (card) => card.topic === topic && seconds >= card.lands,
    );
    return {
      sheets: landed.length,
      top: landed.at(-1)?.index ?? null,
      spot: landed.length > 0 ? back : 1,
    };
  });
}

// The floor lines fade out before the piles move and come back along them in the middle; as the loop starts over they fade out, change places unseen and come back along the slots.
function floorLines(
  { sorted, slides, named }: LabelingTimeline,
  seconds: number,
  back: number,
) {
  if (seconds >= slides && back < 0.5) {
    const shown = ease((seconds - named) / 0.25);
    return { ...TO_MIDDLE, opacity: shown * clamp01(1 - 3 * back) };
  }
  if (back > 0) return { x: 0, y: 0, opacity: clamp01(3 * back - 2) };
  return { x: 0, y: 0, opacity: 1 - ease((seconds - sorted) / CLEAR) };
}

// Every card off the piles, in paint order: the one at the reading square, the queue from its far end, the carried ones back to front.
function cardFrames(cards: readonly Card[], seconds: number, back: number) {
  // The queue stands in its starting slots while it returns.
  const moved = back > 0 ? 0 : queueShift(cards, seconds);
  const waiting: TraceCardFrame[] = [];
  const reading: TraceCardFrame[] = [];
  const carried: TraceCardFrame[] = [];
  for (const card of cards) {
    if (back > 0 || seconds < card.starts) {
      const queued = waitingCard(card, card.index - moved, back || 1);
      if (queued.opacity > 0) waiting.unshift(queued);
    } else if (seconds < card.arrives) {
      reading.push(approachingCard(card, seconds));
    } else if (seconds < card.leaves) {
      reading.push(readingCard(card, seconds));
    } else if (seconds < card.lands) {
      carried.push(carriedCard(card, seconds));
    }
  }
  carried.sort((a, b) => a.y - 0.4 * a.x - (b.y - 0.4 * b.x));
  return [...reading, ...waiting, ...carried];
}

// Slots the queue has moved up: one each time its head leaves.
function queueShift(cards: readonly Card[], seconds: number) {
  return cards.reduce((sum, card) => {
    const lead = 0.3 * (card.arrives - card.starts);
    const shift = Math.min(0.4, card.leaves - card.starts - lead);
    return sum + ease((seconds - card.starts - lead) / shift);
  }, 0);
}

// In the queue, `slot` places from its head; the cards past the last slot fade out.
function waitingCard(
  card: Card,
  slot: number,
  visible: number,
): TraceCardFrame {
  return {
    index: card.index,
    x: round(READING.x + slot * QUEUE.pitch),
    y: QUEUE.y,
    lift: 0,
    opacity: clamp01((QUEUE.slots - slot) / 0.5) * visible,
    colored: 0,
    unread: 1,
    written: 0,
  };
}

// Stepping from the head of the queue onto the reading square.
function approachingCard(card: Card, seconds: number): TraceCardFrame {
  const near = ease((seconds - card.starts) / (card.arrives - card.starts));
  return {
    index: card.index,
    x: READING.x,
    y: round(lerp(QUEUE.y, READING.y, near)),
    lift: 0,
    opacity: 1,
    colored: 0,
    unread: 1,
    written: 0,
  };
}

// On the reading square: its unread lines fade, its intent is written and it takes its topic's colour.
function readingCard(card: Card, seconds: number): TraceCardFrame {
  const read = (seconds - card.arrives) / (card.leaves - card.arrives);
  return {
    index: card.index,
    x: READING.x,
    y: READING.y,
    lift: 0,
    opacity: 1,
    colored: ease((read - 0.1) / 0.6),
    unread: 1 - clamp01(read / 0.25),
    written: Math.ceil(card.letters * clamp01(read / 0.6)),
  };
}

// Lifted off the reading square, carried along the aisle and set down on its pile.
function carriedCard(card: Card, seconds: number): TraceCardFrame {
  const flown = (seconds - card.leaves) / (card.lands - card.leaves);
  const height = card.below * SHEET.height;
  const down = ease((flown - 0.62) / 0.38);
  return {
    index: card.index,
    x: round(
      lerp(READING.x, card.topic * PILE_PITCH, ease((flown - 0.05) / 0.75)),
    ),
    y: round(lerp(lerp(READING.y, AISLE, ease(flown / 0.3)), 0, down)),
    lift: round(
      lerp(Math.max(height, CARRY) * ease(flown / 0.25), height, down),
    ),
    opacity: 1,
    colored: 1,
    unread: 0,
    written: card.letters,
  };
}

// Eases in and out, clamped to 0 and 1.
function ease(progress: number) {
  const p = clamp01(progress);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(2 - 2 * p, 3) / 2;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

export type LabeledTrace = {
  /** Index of the topic it joins. */
  topic: number;
  /** Its intent as written on the card, one entry per line. */
  intent: readonly string[];
};

export type LabelingTimeline = ReturnType<typeof labelingTimeline>;

type Card = {
  /** Position in reading order. */
  index: number;
  topic: number;
  /** Characters in its intent. */
  letters: number;
  /** Seconds into the loop it leaves the queue, reaches the reading square, leaves it and lands on its pile. */
  starts: number;
  arrives: number;
  leaves: number;
  lands: number;
  /** Sheets already on its pile when it lands. */
  below: number;
};

export type TraceCardFrame = {
  /** Position in reading order. */
  index: number;
  x: number;
  y: number;
  lift: number;
  opacity: number;
  /** 0 is grey, 1 its topic's colour. */
  colored: number;
  /** How visible its unread lines are. */
  unread: number;
  /** Characters of its intent written so far. */
  written: number;
};
