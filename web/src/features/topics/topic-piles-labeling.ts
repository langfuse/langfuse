import {
  clamp01,
  round,
} from "@/src/components/illustrations/engine/projection";
import { SHEET } from "./topic-piles-geometry";

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
  const named = Math.max(LEAD, ...cards.map((card) => card.lands)) + 0.05;
  const returns = named + NAMING + HOLD;
  return {
    cards,
    named,
    returns,
    loop: returns + RETURN,
    /** A moment on the final frame, shortly before the loop starts over. */
    still: returns - 1,
  };
}

/** Where everything is `seconds` into the loop; `cards` are in paint order. */
export function labelingFrame(
  { cards, named, returns, loop }: LabelingTimeline,
  seconds: number,
  topics: number,
) {
  const back = ease((seconds - returns) / (loop - returns));
  const piles = Array.from({ length: topics }, (_, topic) => {
    const landed = cards.filter(
      (card) => card.topic === topic && seconds >= card.lands,
    );
    return {
      sheets: landed.length,
      top: landed.at(-1)?.index ?? null,
      spot: landed.length ? back : 1,
    };
  });
  // The queue moves up one slot each time its head leaves.
  const moved = cards.reduce((sum, card) => {
    const lead = 0.3 * (card.arrives - card.starts);
    const shift = Math.min(0.4, card.leaves - card.starts - lead);
    return sum + ease((seconds - card.starts - lead) / shift);
  }, 0);

  const waiting: TraceCardFrame[] = [];
  const reading: TraceCardFrame[] = [];
  const carried: TraceCardFrame[] = [];
  for (const card of cards) {
    const unread = { index: card.index, lift: 0, colored: 0, unread: 1 };
    if (back > 0 || seconds < card.starts) {
      const slot = back > 0 ? card.index : card.index - moved;
      const opacity = clamp01((QUEUE.slots - slot) / 0.5) * (back || 1);
      if (opacity > 0)
        waiting.unshift({
          ...unread,
          x: round(READING.x + slot * QUEUE.pitch),
          y: QUEUE.y,
          opacity,
          written: 0,
        });
    } else if (seconds < card.arrives) {
      const near = ease((seconds - card.starts) / (card.arrives - card.starts));
      reading.push({
        ...unread,
        x: READING.x,
        y: round(lerp(QUEUE.y, READING.y, near)),
        opacity: 1,
        written: 0,
      });
    } else if (seconds < card.leaves) {
      const read = (seconds - card.arrives) / (card.leaves - card.arrives);
      reading.push({
        index: card.index,
        x: READING.x,
        y: READING.y,
        lift: 0,
        opacity: 1,
        colored: ease((read - 0.1) / 0.6),
        unread: 1 - clamp01(read / 0.25),
        written: Math.ceil(card.letters * clamp01(read / 0.6)),
      });
    } else if (seconds < card.lands) {
      const flown = (seconds - card.leaves) / (card.lands - card.leaves);
      const height = card.below * SHEET.height;
      const down = ease((flown - 0.62) / 0.38);
      carried.push({
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
      });
    }
  }
  carried.sort((a, b) => a.y - 0.4 * a.x - (b.y - 0.4 * b.x));

  const lastLeaves = cards.at(-1)?.leaves ?? 0;
  return {
    /** 0 until the loop starts over, 1 when it has. */
    back,
    /** How visible the reading square is. */
    square: Math.max(back, 1 - ease((seconds - lastLeaves) / 0.4)),
    piles,
    /** How visible the top cards' own labels and the topics' names are. */
    intents: 1 - ease((seconds - named) / 0.25),
    names: ease((seconds - named - 0.1) / 0.35),
    cards: [...reading, ...waiting, ...carried],
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
