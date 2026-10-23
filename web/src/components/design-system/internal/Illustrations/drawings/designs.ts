/**
 * The empty states, drawn as empty versions of the Langfuse objects they stand for, in plan units (x along the
 * floor's −20° axis, y along its 60° axis). Each has one raised hero; dashed outlines mark what hasn't arrived yet.
 * The comment above each drawing says what it shows.
 */

import type { Point, Rect } from "../engine/projection";

export type Tone = "pass" | "fail" | "neutral" | "warm";

export type Shape =
  /**
   * An outlined card; dashed = where something will appear (its outline marches). `isLayered`: the hero stands on
   * it on purpose (a row raised out of its table), so the clearance rule lets it run under the hero.
   */
  | { kind: "card"; rect: Rect; dashed?: boolean; isLayered?: boolean }
  /** A skeleton line of text. */
  | { kind: "bar"; rect: Rect; tone?: Tone }
  /** The raised hero; `on` is drawn on its top face, relative to its top-left corner. `plate` skips the accent fill. */
  | { kind: "block"; rect: Rect; depth?: number; plate?: boolean; on?: Shape[] }
  | {
      kind: "dot";
      at: Point;
      tone?: Tone;
      hollow?: boolean;
      pulse?: boolean;
      r?: number;
    }
  | { kind: "chip"; at: Point; text: string; soft?: boolean; size?: number }
  | {
      kind: "text";
      at: Point;
      text: string;
      size?: number;
      tone?: "ink" | "label" | "warm";
    }
  /** Wires and chart lines: `ink` draws a data line, `guide` a dashed guide, `dashed` data still to come. */
  | {
      kind: "path";
      points: Point[];
      ink?: boolean;
      guide?: boolean;
      dashed?: boolean;
      tone?: Tone;
    }
  | { kind: "ring"; at: Point; r: number; dashed?: boolean };

/** Every drawing EmptyState.Illustration can show: one per app area, plus moments like onboarding steps. */
export type DrawingName = keyof typeof DESIGNS;

const r = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

export const DESIGNS = {
  /** An empty trace: the root span, with its child spans still to come */
  traces: [
    {
      kind: "path",
      points: [
        [64, -6],
        [64, 160],
      ],
      guide: true,
    },
    {
      kind: "path",
      points: [
        [128, -6],
        [128, 160],
      ],
      guide: true,
    },
    {
      kind: "path",
      points: [
        [18, 60],
        [18, 93],
        [38, 93],
      ],
    },
    {
      kind: "path",
      points: [
        [18, 93],
        [18, 137],
        [74, 137],
      ],
    },
    { kind: "card", rect: r(38, 78, 150, 30), dashed: true },
    { kind: "card", rect: r(74, 122, 120, 30), dashed: true },
    {
      kind: "block",
      rect: r(0, 20, 176, 36),
      on: [
        { kind: "bar", rect: r(14, 13, 84, 10) },
        { kind: "bar", rect: r(110, 13, 40, 10), tone: "warm" },
      ],
    },
  ],

  /** An empty conversation: the first message, with replies still to come */
  sessions: [
    {
      kind: "path",
      points: [
        [14, 18],
        [14, 140],
      ],
    },
    { kind: "dot", at: [14, 72], r: 4 },
    { kind: "dot", at: [14, 124], r: 4, hollow: true },
    { kind: "card", rect: r(64, 56, 150, 34) },
    { kind: "bar", rect: r(78, 68, 104, 10) },
    { kind: "card", rect: r(34, 108, 130, 34), dashed: true },
    {
      kind: "block",
      rect: r(34, 0, 150, 34),
      on: [{ kind: "bar", rect: r(14, 12, 96, 10) }],
    },
  ],

  /** Halo, the in-app agent, the Halo scene in small: your message wired into its tile, two steps done beside it, and the result still to come */
  halo: [
    { kind: "card", rect: r(0, 0, 170, 28) },
    { kind: "bar", rect: r(12, 10, 110, 8) },
    {
      kind: "path",
      points: [
        [24, 28],
        [24, 50],
      ],
    },
    {
      kind: "path",
      points: [
        [64, 66],
        [84, 66],
      ],
    },
    {
      kind: "path",
      points: [
        [64, 94],
        [84, 94],
      ],
    },
    { kind: "card", rect: r(84, 55, 130, 22) },
    { kind: "bar", rect: r(94, 62, 64, 8) },
    { kind: "dot", at: [202, 66], r: 4, tone: "pass" },
    { kind: "card", rect: r(84, 83, 130, 22) },
    { kind: "bar", rect: r(94, 90, 52, 8) },
    { kind: "dot", at: [202, 94], r: 4, tone: "pass" },
    { kind: "card", rect: r(84, 113, 130, 26), dashed: true },
    { kind: "chip", at: [94, 117], text: "0.92", soft: true, size: 12 },
    { kind: "dot", at: [202, 126], r: 4, hollow: true, tone: "pass" },
    {
      kind: "block",
      rect: r(0, 50, 64, 64),
      on: [
        // HaloIcon's own paths (24 units, ×2.4, centred): the halo, the speech-bubble head, its eyes and ears
        {
          kind: "path",
          ink: true,
          points: [
            [44.0, 13.4],
            [43.1, 14.8],
            [40.5, 15.9],
            [36.6, 16.7],
            [32.0, 17.0],
            [27.4, 16.7],
            [23.5, 15.9],
            [20.9, 14.8],
            [20.0, 13.4],
            [20.9, 12.0],
            [23.5, 10.9],
            [27.4, 10.1],
            [32.0, 9.8],
            [36.6, 10.1],
            [40.5, 10.9],
            [43.1, 12.0],
            [44.0, 13.4],
          ],
        },
        {
          kind: "path",
          ink: true,
          points: [
            [24.3, 46.5],
            [16.6, 54.2],
            [16.6, 27.3],
            [17.8, 24.7],
            [20.5, 23.5],
            [43.5, 23.5],
            [46.2, 24.7],
            [47.4, 27.3],
            [47.4, 42.7],
            [46.2, 45.3],
            [43.5, 46.5],
            [24.3, 46.5],
          ],
        },
        {
          kind: "path",
          ink: true,
          points: [
            [26.2, 33.1],
            [26.2, 36.9],
          ],
        },
        {
          kind: "path",
          ink: true,
          points: [
            [37.8, 33.1],
            [37.8, 36.9],
          ],
        },
        {
          kind: "path",
          ink: true,
          points: [
            [12.8, 35.0],
            [16.6, 35.0],
          ],
        },
        {
          kind: "path",
          ink: true,
          points: [
            [47.4, 35.0],
            [51.2, 35.0],
          ],
        },
      ],
    },
  ],

  /** A user card, with an outline where the next user goes */
  users: [
    { kind: "card", rect: r(44, 98, 156, 56), dashed: true },
    { kind: "ring", at: [72, 126], r: 13, dashed: true },
    {
      kind: "block",
      rect: r(0, 20, 156, 56),
      on: [
        { kind: "dot", at: [28, 28], r: 13 },
        { kind: "bar", rect: r(52, 17, 76, 10) },
        { kind: "bar", rect: r(52, 33, 46, 8) },
      ],
    },
  ],

  /** A prompt's versions: v1, a raised v2, and a slot for the next version */
  prompts: [
    { kind: "card", rect: r(0, 0, 76, 40) },
    { kind: "chip", at: [14, 9], text: "v1", soft: true },
    {
      kind: "path",
      points: [
        [38, 40],
        [38, 62],
      ],
    },
    {
      kind: "path",
      points: [
        [38, 104],
        [38, 126],
      ],
    },
    { kind: "card", rect: r(0, 126, 76, 40), dashed: true },
    {
      kind: "path",
      points: [
        [118, 83],
        [152, 83],
      ],
    },
    { kind: "card", rect: r(152, 66, 116, 34) },
    { kind: "dot", at: [170, 83], r: 5, hollow: true, tone: "pass" },
    { kind: "bar", rect: r(184, 78, 66, 10) },
    {
      kind: "block",
      rect: r(0, 62, 118, 42),
      on: [
        { kind: "chip", at: [12, 10], text: "v2" },
        { kind: "bar", rect: r(56, 16, 46, 10) },
      ],
    },
  ],

  /** Score rows: one score, the others still empty */
  scores: [
    { kind: "card", rect: r(30, 64, 180, 32), dashed: true },
    { kind: "dot", at: [150, 80], r: 5, hollow: true },
    { kind: "card", rect: r(60, 108, 180, 32), dashed: true },
    { kind: "dot", at: [180, 124], r: 5, hollow: true },
    {
      kind: "block",
      rect: r(0, 4, 180, 38),
      on: [
        { kind: "bar", rect: r(14, 14, 76, 10) },
        { kind: "dot", at: [112, 19], r: 5, tone: "pass", pulse: true },
        { kind: "bar", rect: r(126, 14, 34, 10) },
      ],
    },
  ],

  /** An evaluator wired to score rows it hasn't filled yet */
  evaluators: [
    {
      kind: "path",
      points: [
        [18, 48],
        [18, 168],
        [42, 168],
      ],
    },
    {
      kind: "path",
      points: [
        [18, 80],
        [42, 80],
      ],
    },
    {
      kind: "path",
      points: [
        [18, 124],
        [42, 124],
      ],
    },
    { kind: "card", rect: r(42, 66, 150, 28), dashed: true },
    { kind: "dot", at: [170, 80], r: 5, hollow: true, tone: "pass" },
    { kind: "card", rect: r(42, 110, 150, 28), dashed: true },
    { kind: "dot", at: [170, 124], r: 5, hollow: true, tone: "pass" },
    { kind: "card", rect: r(42, 154, 150, 28), dashed: true },
    { kind: "dot", at: [170, 168], r: 5, hollow: true, tone: "fail" },
    {
      kind: "block",
      rect: r(0, 0, 134, 44),
      on: [{ kind: "bar", rect: r(16, 17, 76, 10) }],
    },
  ],

  /** An empty table: its columns, with no rows yet */
  datasets: [
    { kind: "card", rect: r(0, 58, 196, 30), dashed: true },
    { kind: "card", rect: r(0, 98, 196, 30), dashed: true },
    { kind: "card", rect: r(0, 138, 196, 30), dashed: true },
    {
      kind: "block",
      rect: r(0, 0, 196, 36),
      on: [
        { kind: "bar", rect: r(12, 13, 44, 10) },
        { kind: "bar", rect: r(72, 13, 52, 10) },
        { kind: "bar", rect: r(140, 13, 40, 10) },
      ],
    },
  ],

  /** A dataset with one item and empty rows for more */
  datasetItems: [
    { kind: "card", rect: r(0, 0, 222, 156), isLayered: true },
    { kind: "card", rect: r(14, 68, 194, 34), dashed: true },
    { kind: "text", at: [104, 90], text: "+", size: 18 },
    { kind: "card", rect: r(14, 114, 194, 34), dashed: true },
    {
      kind: "block",
      rect: r(14, 14, 194, 36),
      depth: 10,
      on: [
        { kind: "bar", rect: r(12, 13, 66, 10) },
        {
          kind: "path",
          points: [
            [88, 18],
            [104, 18],
          ],
        },
        { kind: "bar", rect: r(114, 13, 66, 10) },
      ],
    },
  ],

  /** An experiment chart with its runs still drawing in */
  experiments: [
    {
      kind: "block",
      rect: r(0, 0, 226, 150),
      depth: 8,
      plate: true,
      on: [
        {
          kind: "path",
          points: [
            [12, 50],
            [214, 50],
          ],
          guide: true,
        },
        {
          kind: "path",
          points: [
            [12, 100],
            [214, 100],
          ],
          guide: true,
        },
        {
          kind: "path",
          points: [
            [14, 92],
            [54, 74],
            [92, 86],
            [132, 60],
            [172, 70],
            [212, 46],
          ],
          dashed: true,
        },
        {
          kind: "path",
          points: [
            [14, 124],
            [44, 96],
            [74, 110],
          ],
          ink: true,
        },
        {
          kind: "path",
          points: [
            [74, 110],
            [106, 78],
            [138, 90],
            [170, 62],
            [206, 72],
          ],
          dashed: true,
        },
        { kind: "chip", at: [16, 128], text: "set A" },
      ],
    },
  ],

  /** One experiment run, with outlines for the next runs */
  datasetRuns: [
    { kind: "card", rect: r(36, 114, 176, 40), dashed: true },
    { kind: "card", rect: r(18, 62, 176, 40), dashed: true },
    { kind: "dot", at: [170, 82], r: 5, hollow: true },
    {
      kind: "block",
      rect: r(0, 0, 176, 40),
      on: [
        { kind: "chip", at: [12, 9], text: "run-1", soft: true },
        { kind: "dot", at: [154, 20], r: 5, tone: "pass" },
      ],
    },
  ],

  /** An annotation form with True picked and the score still empty */
  annotationQueues: [
    { kind: "card", rect: r(0, 0, 204, 36) },
    { kind: "bar", rect: r(14, 13, 92, 10) },
    {
      kind: "path",
      points: [
        [180, 14],
        [186, 20],
        [192, 14],
      ],
      ink: true,
    },
    { kind: "card", rect: r(108, 54, 96, 42) },
    { kind: "text", at: [126, 81], text: "False" },
    { kind: "card", rect: r(0, 118, 204, 26), dashed: true },
    {
      kind: "block",
      rect: r(0, 54, 96, 42),
      on: [{ kind: "text", at: [26, 27], text: "True", tone: "ink" }],
    },
  ],

  /** A dashboard with one chart tile and empty tiles */
  dashboards: [
    { kind: "card", rect: r(114, 0, 102, 74), dashed: true },
    { kind: "card", rect: r(0, 96, 216, 62), dashed: true },
    {
      kind: "block",
      rect: r(0, 0, 102, 74),
      on: [
        { kind: "bar", rect: r(14, 38, 12, 24) },
        { kind: "bar", rect: r(32, 22, 12, 40) },
        { kind: "bar", rect: r(50, 44, 12, 18) },
        { kind: "bar", rect: r(68, 30, 12, 32) },
      ],
    },
  ],

  /** A chart with no data in its time range */
  widgets: [
    {
      kind: "block",
      rect: r(0, 0, 214, 132),
      depth: 8,
      plate: true,
      on: [
        {
          kind: "path",
          points: [
            [16, 14],
            [16, 112],
            [198, 112],
          ],
          ink: true,
        },
        {
          kind: "path",
          points: [
            [16, 56],
            [198, 56],
          ],
          guide: true,
        },
        {
          kind: "path",
          points: [
            [24, 96],
            [190, 96],
          ],
          dashed: true,
        },
        { kind: "dot", at: [108, 96], r: 5, hollow: true },
      ],
    },
  ],

  /** A cost chart with no usage yet and its tooltip at $0.00 */
  metrics: [
    { kind: "card", rect: r(0, 30, 214, 124), isLayered: true },
    {
      kind: "path",
      points: [
        [14, 80],
        [200, 80],
      ],
      guide: true,
    },
    {
      kind: "path",
      points: [
        [14, 138],
        [200, 138],
      ],
      ink: true,
    },
    {
      kind: "path",
      points: [
        [22, 124],
        [60, 110],
        [98, 118],
        [136, 98],
        [174, 106],
        [198, 92],
      ],
      dashed: true,
    },
    {
      kind: "path",
      points: [
        [136, 32],
        [136, 138],
      ],
      ink: true,
    },
    { kind: "dot", at: [136, 98], r: 5, hollow: true, tone: "warm" },
    {
      kind: "block",
      rect: r(110, -12, 96, 36),
      on: [{ kind: "text", at: [14, 24], text: "$0.00", tone: "warm" }],
    },
  ],

  /** A monitor's threshold drawn over a quiet series */
  monitors: [
    { kind: "card", rect: r(0, 0, 214, 124), isLayered: true },
    {
      kind: "path",
      points: [
        [14, 40],
        [200, 40],
      ],
      dashed: true,
      tone: "fail",
    },
    {
      kind: "path",
      points: [
        [14, 100],
        [54, 84],
        [94, 92],
        [134, 70],
        [174, 80],
        [200, 66],
      ],
      ink: true,
    },
    {
      kind: "block",
      rect: r(118, 96, 112, 36),
      on: [
        { kind: "dot", at: [18, 18], r: 5, tone: "fail", pulse: true },
        { kind: "bar", rect: r(34, 13, 60, 10) },
      ],
    },
  ],

  /** A comment, with its replies still to come */
  comments: [
    {
      kind: "path",
      points: [
        [22, 50],
        [22, 96],
        [44, 96],
      ],
    },
    { kind: "card", rect: r(44, 76, 156, 40), dashed: true },
    { kind: "ring", at: [64, 96], r: 9, dashed: true },
    {
      kind: "block",
      rect: r(0, 0, 186, 50),
      on: [
        { kind: "dot", at: [22, 25], r: 11 },
        { kind: "bar", rect: r(42, 14, 116, 9) },
        { kind: "bar", rect: r(42, 29, 72, 8) },
      ],
    },
  ],

  /** An API key pair: the public key, with the secret key still to create */
  apiKeys: [
    { kind: "card", rect: r(26, 62, 196, 40), dashed: true },
    { kind: "text", at: [42, 88], text: "sk-lf-…" },
    {
      kind: "block",
      rect: r(0, 0, 196, 40),
      on: [
        { kind: "chip", at: [12, 9], text: "pk-lf-…", soft: true },
        { kind: "dot", at: [176, 20], r: 5, tone: "pass" },
      ],
    },
  ],

  /** Langfuse wired to an LLM provider that isn't connected yet */
  llmConnections: [
    {
      kind: "path",
      points: [
        [96, 32],
        [154, 32],
      ],
      dashed: true,
    },
    { kind: "card", rect: r(154, 0, 96, 64), dashed: true },
    { kind: "text", at: [180, 39], text: "LLM" },
    {
      kind: "block",
      rect: r(0, 0, 96, 64),
      on: [{ kind: "chip", at: [22, 18], text: "API" }],
    },
  ],

  /** A model with its price, and an outline for a custom model */
  models: [
    { kind: "card", rect: r(0, 64, 176, 30) },
    { kind: "bar", rect: r(12, 74, 44, 10) },
    { kind: "bar", rect: r(120, 74, 40, 10), tone: "warm" },
    { kind: "card", rect: r(0, 106, 176, 42), dashed: true },
    {
      kind: "block",
      rect: r(0, 0, 176, 42),
      on: [
        { kind: "chip", at: [12, 10], text: "gpt-5", soft: true },
        { kind: "bar", rect: r(108, 16, 52, 10) },
      ],
    },
  ],

  /** A prompt version change wired to a webhook that isn't set up yet */
  automations: [
    { kind: "card", rect: r(0, 0, 112, 42) },
    { kind: "chip", at: [12, 10], text: "v3", soft: true },
    { kind: "bar", rect: r(52, 16, 44, 10) },
    {
      kind: "path",
      points: [
        [112, 21],
        [150, 21],
        [150, 82],
        [172, 82],
      ],
      dashed: true,
    },
    {
      kind: "block",
      rect: r(110, 62, 124, 42),
      on: [
        { kind: "chip", at: [12, 10], text: "POST" },
        { kind: "bar", rect: r(74, 16, 34, 10) },
      ],
    },
  ],

  /** Traces waiting to be grouped into topics */
  topics: [
    { kind: "ring", at: [52, 94], r: 38, dashed: true },
    { kind: "ring", at: [144, 120], r: 32, dashed: true },
    { kind: "dot", at: [40, 84], r: 4 },
    { kind: "dot", at: [62, 102], r: 4 },
    { kind: "dot", at: [48, 112], r: 4 },
    { kind: "dot", at: [138, 112], r: 4 },
    { kind: "dot", at: [156, 128], r: 4 },
    { kind: "dot", at: [96, 164], r: 4 },
    {
      kind: "block",
      rect: r(96, 0, 120, 34),
      on: [{ kind: "bar", rect: r(14, 12, 72, 10) }],
    },
  ],

  /** Your member card, with an outline where a teammate goes */
  members: [
    { kind: "card", rect: r(44, 76, 156, 54), dashed: true },
    { kind: "ring", at: [70, 103], r: 13, dashed: true },
    { kind: "text", at: [104, 109], text: "+", size: 18 },
    {
      kind: "block",
      rect: r(0, 0, 156, 54),
      on: [
        { kind: "dot", at: [26, 27], r: 13 },
        { kind: "bar", rect: r(50, 14, 64, 9) },
        { kind: "chip", at: [50, 28], text: "owner", soft: true, size: 12 },
      ],
    },
  ],

  /** An audit log with a single entry */
  auditLogs: [
    { kind: "card", rect: r(0, 54, 204, 32) },
    { kind: "bar", rect: r(66, 65, 90, 10) },
    { kind: "card", rect: r(0, 98, 204, 32), dashed: true },
    { kind: "card", rect: r(0, 142, 204, 32), dashed: true },
    {
      kind: "block",
      rect: r(0, 0, 204, 32),
      on: [
        { kind: "text", at: [12, 22], text: "09:41", size: 14 },
        { kind: "bar", rect: r(66, 11, 110, 10) },
      ],
    },
  ],

  /** A search with no results under it */
  noResults: [
    { kind: "card", rect: r(0, 62, 204, 30), dashed: true },
    { kind: "card", rect: r(0, 104, 204, 30), dashed: true },
    {
      kind: "block",
      rect: r(0, 0, 204, 40),
      on: [
        { kind: "ring", at: [22, 18], r: 8 },
        {
          kind: "path",
          points: [
            [28, 24],
            [34, 30],
          ],
          ink: true,
        },
        { kind: "bar", rect: r(44, 15, 96, 10) },
      ],
    },
  ],

  // Moments: setting up tracing, the first trace arriving (the same trace as `traces`, filled in), debugging one span
  /** Your app wired to Langfuse through the SDK, its first trace still to come */
  instrument: [
    {
      kind: "path",
      points: [
        [132, 30],
        [176, 30],
      ],
      dashed: true,
    },
    { kind: "card", rect: r(176, 4, 112, 52), dashed: true },
    { kind: "dot", at: [196, 30], r: 5, hollow: true },
    { kind: "card", rect: r(212, 25, 56, 10), dashed: true },
    {
      kind: "block",
      rect: r(0, 0, 132, 60),
      on: [
        { kind: "chip", at: [12, 10], text: "SDK" },
        { kind: "bar", rect: r(12, 36, 84, 8) },
        { kind: "bar", rect: r(12, 48, 52, 8) },
      ],
    },
  ],

  /** Your first trace: the root span and its child spans, all in */
  firstTrace: [
    {
      kind: "path",
      points: [
        [64, -6],
        [64, 160],
      ],
      guide: true,
    },
    {
      kind: "path",
      points: [
        [128, -6],
        [128, 160],
      ],
      guide: true,
    },
    {
      kind: "path",
      points: [
        [18, 60],
        [18, 93],
        [38, 93],
      ],
    },
    {
      kind: "path",
      points: [
        [18, 93],
        [18, 137],
        [74, 137],
      ],
    },
    { kind: "card", rect: r(38, 78, 150, 30) },
    { kind: "bar", rect: r(52, 88, 70, 10) },
    { kind: "bar", rect: r(132, 88, 36, 10), tone: "warm" },
    { kind: "card", rect: r(74, 122, 120, 30) },
    { kind: "bar", rect: r(88, 132, 52, 10) },
    { kind: "dot", at: [176, 137], r: 4, tone: "pass" },
    {
      kind: "block",
      rect: r(0, 20, 176, 36),
      on: [
        { kind: "bar", rect: r(14, 13, 84, 10) },
        { kind: "bar", rect: r(110, 13, 30, 10), tone: "warm" },
        { kind: "dot", at: [156, 18], r: 5, tone: "pass", pulse: true },
      ],
    },
  ],

  /** A trace with its one failing span raised for a closer look */
  failedSpan: [
    {
      kind: "path",
      points: [
        [18, 34],
        [18, 69],
        [38, 69],
      ],
    },
    {
      kind: "path",
      points: [
        [18, 69],
        [18, 123],
        [38, 123],
      ],
    },
    { kind: "card", rect: r(0, 0, 186, 34) },
    { kind: "bar", rect: r(14, 12, 84, 10) },
    { kind: "dot", at: [166, 17], r: 4, tone: "pass" },
    { kind: "card", rect: r(38, 108, 150, 30) },
    { kind: "bar", rect: r(52, 118, 70, 10) },
    { kind: "dot", at: [170, 123], r: 4, tone: "pass" },
    {
      kind: "block",
      rect: r(38, 52, 150, 34),
      on: [
        { kind: "bar", rect: r(14, 12, 72, 10) },
        { kind: "dot", at: [128, 17], r: 5, tone: "fail", pulse: true },
      ],
    },
  ],

  /** An empty placeholder */
  fallback: [
    { kind: "card", rect: r(0, 0, 130, 56), dashed: true, isLayered: true },
    { kind: "card", rect: r(76, 114, 130, 44), dashed: true },
    {
      kind: "block",
      rect: r(36, 36, 136, 56),
      on: [
        { kind: "bar", rect: r(16, 17, 76, 10) },
        { kind: "bar", rect: r(16, 33, 46, 8) },
      ],
    },
  ],
} satisfies Record<string, Shape[]>;
