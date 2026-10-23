import type { ObservationLevelType, ObservationType } from "@langfuse/shared";
import type { Gate } from "./gates";

export type ApiKeys = {
  publicKey: string;
  secretKey: string;
};

/**
 * This project's keys: none yet, being created, ready (Langfuse shows the secret only now), or out of reach because
 * the viewer's role can't create them.
 */
export type ProjectKeys =
  | { status: "none" }
  | { status: "creating" }
  | { status: "ready"; keys: ApiKeys }
  | { status: "noAccess" };

/** The parts of a setup copied so far, each checked off on its step. */
export type CopyChecks = { env: boolean; setup: boolean };

/** One step of a trace. The trace view's `TreeNode` has this shape, so the page can pass the tree it builds. */
export type FirstTraceNode = {
  id: string;
  type: "TRACE" | ObservationType;
  name: string;
  startTime: Date;
  endTime?: Date | null;
  /** In seconds; the only duration a trace's wrapper node has. */
  latency?: number;
  level?: ObservationLevelType;
  statusMessage?: string | null;
  model?: string | null;
  children: FirstTraceNode[];
};

export type FirstTrace = {
  id: string;
  name: string;
  href: string;
  /** An app's trace, or a coding agent's turn (`slug` is its integration, its turns share a session). */
  source:
    | { kind: "app" }
    | { kind: "agent"; slug: string; sessionHref: string };
  totalTokens: number;
  /** `null` when the model has no price, so the card shows no cost rather than $0. */
  costUsd: number | null;
  /** What went in and what came out, as text. */
  io: { input: string; output: string } | null;
  roots: FirstTraceNode[];
};

/**
 * Scoring the first trace, the reward for connecting a model: no model yet, connecting one, picking the judge,
 * judging, or scored.
 */
export type Scoring =
  | { status: "noModel" }
  | { status: "connecting"; provider: string }
  | { status: "pickJudge"; provider: string }
  | { status: "judging"; judge: string }
  | {
      status: "scored";
      score: { name: string; value: number; reason: string };
      evaluatorHref: string;
    };

/**
 * What the project traces first: an app, through one integration or (`null`) the one prompt for any stack, or a
 * coding agent's sessions (`slug` is its integration).
 */
export type Way =
  | { kind: "app"; integration: string | null }
  | { kind: "agent"; slug: string };

/** One exchange with the demo app: its answer and its trace arrive together, `null` while it answers. */
export type DemoTurn = {
  question: string;
  answer: string | null;
  trace: FirstTrace | null;
};

/**
 * Where a project is on the way to its first trace. Picking a way opens its setup, which listens for the trace from
 * the start. The demo chat, before any setup, makes demo traces that don't count as the first one.
 */
export type TraceSetupState =
  | { step: "wayIn" }
  | { step: "demo"; turns: DemoTurn[] }
  | { step: "setup"; way: Way; copied: CopyChecks }
  | {
      step: "traceIn";
      /** The trace on screen; a newer one waits in `newer` for "show", so nothing moves while it's read. */
      trace: FirstTrace;
      newer: FirstTrace | null;
      /** A newer trace replaced the first one on request. */
      isNewerShown: boolean;
      /** Traces since the page opened. */
      traceCount: number;
      secondsSinceLatest: number;
      scoring: Scoring;
      /** Gates moved past with "Not now", kept to pick up from the ladder. */
      skippedGates: Gate[];
      /** They opened the trace and came back: only then is the other way in offered beside it. */
      hasOpenedTrace: boolean;
    };

/**
 * A project for the other way in, so an app's traces and an agent's turns stay apart: none yet, being created, or
 * ready with its own keys.
 */
export type NewProject =
  | { status: "none" }
  | { status: "creating" }
  | { status: "ready"; name: string; href: string; keys: ApiKeys };

/** What a way-in card offers: the first choice, the other way while one is set up, or a new project once a trace is in. */
export type WayOffer = "choice" | "alternative" | "newProject";

/** Where a setup sends its traces: this project, or a new one its first step creates with its own keys. */
export type SetupTarget =
  | { project: "this" }
  | {
      project: "new";
      newProject: NewProject;
      canCreateProject: boolean;
      onCreateProject: (name: string) => void;
    };

/**
 * What the integrations panel shows in place of the setup card or the top row: the browser (`isReturn` when coming
 * back to it), where a pick for this project closes the panel and lands in the card, or, for the other way in, that
 * integration's setup in a new project.
 */
export type PanelView =
  | {
      kind: "browse";
      category: string | null;
      isReturn: boolean;
      project: "this" | "new";
    }
  | { kind: "setup"; slug: string };

/** Where the panel stood in when it closed, so that part slides back in. */
export type PanelPlace = "card" | "row";

/** Everything the page shows, as `useTraceSetup` keeps it. */
export type TraceSetupModel = {
  setup: TraceSetupState;
  keys: ProjectKeys;
  /** The project the other way in sets up in, once a first trace decided what this one is for. */
  newProject: NewProject;
  panel: PanelView | null;
  returnedTo: PanelPlace | null;
  /** Something changed since the page opened (a pick, a new step), so changes animate; the state it opened in doesn't. */
  shouldAnimate: boolean;
};

/** What the page knows about the project and the viewer, beside the setup itself. */
export type SetupProject = {
  id: string;
  baseUrl: string;
  /** The in-app agent is on for this project: Halo sets scoring up. */
  isHaloOn: boolean;
  /** Someone else has joined the project, the last gate to a set-up project. */
  hasTeammates: boolean;
  canCreateProject: boolean;
};

/** Everything the page can do, one call per thing you do on it. */
export type TraceSetupActions = {
  /** Picks what to trace, or switches it in place; creates the keys if there are none. */
  pickWay: (way: Way) => void;
  /** Creates the keys when picking a way didn't, e.g. after a failed first try. */
  createKeys: () => void;
  /** Runs after a part was copied; on the setup card it checks that step off. */
  copy: (part: keyof CopyChecks) => void;
  startDemo: () => void;
  sendDemoMessage: (question: string) => void;
  leaveDemo: () => void;
  /** Swaps the trace on screen for the newest one. */
  showNewest: () => void;
  skipGate: (gate: Gate) => void;
  resumeGate: (gate: Gate) => void;
  /** Connects a model for the judge (saved as an LLM connection). */
  connectModel: (provider: string, apiKey: string) => void;
  pickJudge: (judge: string) => void;
  askHalo: (ask: string) => void;
  createProject: (name: string) => void;
  openPanel: (view: PanelView) => void;
  changePanel: (view: PanelView) => void;
  /** Back to the page; a pick for this project lands in the setup card. */
  closePanel: (picked: Way | null) => void;
};
