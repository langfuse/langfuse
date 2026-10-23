import { useReducer } from "react";
import type { Gate } from "./gates";
import type {
  ApiKeys,
  CopyChecks,
  DemoTurn,
  FirstTrace,
  NewProject,
  PanelPlace,
  PanelView,
  Scoring,
  TraceSetupActions,
  TraceSetupModel,
  TraceSetupState,
  Way,
} from "./types";

type Scored = Extract<Scoring, { status: "scored" }>;

/** What the page does for the setup: each call that needs the server resolves with what the setup shows next. */
export type TraceSetupEffects = {
  createKeys: () => Promise<ApiKeys>;
  createProject: (
    name: string,
  ) => Promise<Extract<NewProject, { status: "ready" }>>;
  /** Tests and saves the key as an LLM connection. */
  connectModel: (provider: string, apiKey: string) => Promise<void>;
  /** Creates the judge and scores the first trace with it. */
  pickJudge: (
    judge: string,
  ) => Promise<Pick<Scored, "score" | "evaluatorHref">>;
  /** The demo app's answer, with its demo trace. */
  askDemo: (question: string) => Promise<{ answer: string; trace: FirstTrace }>;
  askHalo: (ask: string) => void;
  /** Runs after a part of a setup was copied, from the card or the panel. */
  onCopy: (part: keyof CopyChecks) => void;
};

/** Where the page opens: the step it's on, its keys, and the other way in's project. */
export type TraceSetupStart = Pick<
  TraceSetupModel,
  "setup" | "keys" | "newProject"
>;

export type TraceSetupEvent =
  | { type: "pickWay"; way: Way }
  | { type: "createKeys" }
  | { type: "keysCreated"; keys: ApiKeys }
  | { type: "keysFailed" }
  | { type: "copy"; part: keyof CopyChecks }
  | { type: "startDemo" }
  | { type: "leaveDemo" }
  | { type: "demoAsked"; question: string }
  | { type: "demoAnswered"; answer: string; trace: FirstTrace }
  | { type: "demoFailed" }
  | { type: "traceArrived"; trace: FirstTrace }
  | { type: "timePassed"; secondsSinceLatest: number }
  | { type: "showNewest" }
  | { type: "traceOpened" }
  | { type: "skipGate"; gate: Gate }
  | { type: "resumeGate"; gate: Gate }
  | { type: "connectModel"; provider: string }
  | { type: "modelConnected"; provider: string }
  | { type: "modelFailed" }
  | { type: "pickJudge"; judge: string }
  | { type: "scored"; scoring: Scored }
  | { type: "judgeFailed"; provider: string }
  | { type: "createProject" }
  | {
      type: "projectCreated";
      project: Extract<NewProject, { status: "ready" }>;
    }
  | { type: "projectFailed" }
  | { type: "openPanel"; view: PanelView }
  | { type: "changePanel"; view: PanelView }
  | { type: "closePanel"; picked: Way | null };

type TraceIn = Extract<TraceSetupState, { step: "traceIn" }>;

const NOTHING_COPIED: CopyChecks = { env: false, setup: false };

/** The model the page opens in: nothing has changed in front of you yet. */
export function initialModelOf(start: TraceSetupStart): TraceSetupModel {
  return { ...start, panel: null, returnedTo: null, shouldAnimate: false };
}

/** A new way opens its setup; the env copy carries over, the setup's doesn't (its prompt or install changed). */
function pickWay(model: TraceSetupModel, way: Way): TraceSetupModel {
  if (model.setup.step === "traceIn") return model;
  const copied =
    model.setup.step === "setup"
      ? { env: model.setup.copied.env, setup: false }
      : NOTHING_COPIED;
  return {
    ...model,
    setup: { step: "setup", way, copied },
    panel: null,
    shouldAnimate: true,
  };
}

/** The first trace opens the receipt; later ones count up and wait for "show". */
function traceArrived(
  model: TraceSetupModel,
  trace: FirstTrace,
): TraceSetupModel {
  if (model.setup.step === "traceIn")
    return {
      ...model,
      setup: {
        ...model.setup,
        newer: trace,
        traceCount: model.setup.traceCount + 1,
        secondsSinceLatest: 0,
      },
    };
  const isPickForThisProject =
    model.panel?.kind === "browse" && model.panel.project === "this";
  return {
    ...model,
    setup: {
      step: "traceIn",
      trace,
      newer: null,
      isNewerShown: false,
      traceCount: 1,
      secondsSinceLatest: 0,
      scoring: { status: "noModel" },
      skippedGates: [],
      hasOpenedTrace: false,
    },
    panel: isPickForThisProject ? null : model.panel,
    shouldAnimate: true,
  };
}

/** Changes the trace step; every other step ignores what only happens to a trace on screen. */
function onTraceIn(
  model: TraceSetupModel,
  change: (setup: TraceIn) => TraceIn,
): TraceSetupModel {
  if (model.setup.step !== "traceIn") return model;
  return { ...model, setup: change(model.setup) };
}

function onDemo(
  model: TraceSetupModel,
  change: (turns: DemoTurn[]) => DemoTurn[],
): TraceSetupModel {
  if (model.setup.step !== "demo") return model;
  return {
    ...model,
    setup: { step: "demo", turns: change(model.setup.turns) },
  };
}

/** Where the panel stands in: the setup card once a way is picked, the whole row before. */
export function panelPlaceOf(setup: TraceSetupState): PanelPlace {
  return setup.step === "setup" || setup.step === "traceIn" ? "card" : "row";
}

function closePanel(
  model: TraceSetupModel,
  picked: Way | null,
): TraceSetupModel {
  const closed = {
    ...model,
    panel: null,
    returnedTo: panelPlaceOf(model.setup),
  };
  return picked
    ? { ...pickWay(closed, picked), returnedTo: closed.returnedTo }
    : closed;
}

/** Every transition of the first-trace page, from what you do on it and what the page tells it. */
export function traceSetupReducer(
  model: TraceSetupModel,
  event: TraceSetupEvent,
): TraceSetupModel {
  switch (event.type) {
    case "pickWay":
      return pickWay(model, event.way);
    case "createKeys":
      return model.keys.status === "none"
        ? { ...model, keys: { status: "creating" } }
        : model;
    case "keysCreated":
      return { ...model, keys: { status: "ready", keys: event.keys } };
    case "keysFailed":
      return model.keys.status === "creating"
        ? { ...model, keys: { status: "none" } }
        : model;
    case "copy":
      if (model.setup.step !== "setup" || model.panel) return model;
      return {
        ...model,
        setup: {
          ...model.setup,
          copied: { ...model.setup.copied, [event.part]: true },
        },
      };
    case "startDemo":
      if (model.setup.step !== "wayIn") return model;
      return {
        ...model,
        setup: { step: "demo", turns: [] },
        shouldAnimate: true,
      };
    case "leaveDemo":
      if (model.setup.step !== "demo") return model;
      return { ...model, setup: { step: "wayIn" }, shouldAnimate: true };
    case "demoAsked":
      return onDemo(model, (turns) => [
        ...turns,
        { question: event.question, answer: null, trace: null },
      ]);
    case "demoAnswered":
      return onDemo(model, (turns) =>
        turns.map((turn, index) =>
          index === turns.length - 1 && turn.answer === null
            ? { ...turn, answer: event.answer, trace: event.trace }
            : turn,
        ),
      );
    case "demoFailed":
      return onDemo(model, (turns) =>
        turns.filter(
          (turn, index) => index !== turns.length - 1 || turn.answer !== null,
        ),
      );
    case "traceArrived":
      return traceArrived(model, event.trace);
    case "timePassed":
      return onTraceIn(model, (setup) => ({
        ...setup,
        secondsSinceLatest: event.secondsSinceLatest,
      }));
    case "showNewest":
      return onTraceIn(model, (setup) =>
        setup.newer
          ? { ...setup, trace: setup.newer, newer: null, isNewerShown: true }
          : setup,
      );
    case "traceOpened":
      return onTraceIn(model, (setup) => ({ ...setup, hasOpenedTrace: true }));
    case "skipGate":
      return onTraceIn(model, (setup) =>
        setup.skippedGates.includes(event.gate)
          ? setup
          : { ...setup, skippedGates: [...setup.skippedGates, event.gate] },
      );
    case "resumeGate":
      return onTraceIn(model, (setup) => ({
        ...setup,
        skippedGates: setup.skippedGates.filter((gate) => gate !== event.gate),
      }));
    case "connectModel":
      return onTraceIn(model, (setup) => ({
        ...setup,
        scoring: { status: "connecting", provider: event.provider },
      }));
    case "modelConnected":
      return onTraceIn(model, (setup) => ({
        ...setup,
        scoring: { status: "pickJudge", provider: event.provider },
      }));
    case "modelFailed":
      return onTraceIn(model, (setup) => ({
        ...setup,
        scoring: { status: "noModel" },
      }));
    case "pickJudge":
      return onTraceIn(model, (setup) => ({
        ...setup,
        scoring: { status: "judging", judge: event.judge },
      }));
    case "scored":
      return onTraceIn(model, (setup) => ({
        ...setup,
        scoring: event.scoring,
      }));
    case "judgeFailed":
      return onTraceIn(model, (setup) => ({
        ...setup,
        scoring: { status: "pickJudge", provider: event.provider },
      }));
    case "createProject":
      return { ...model, newProject: { status: "creating" } };
    case "projectCreated":
      return { ...model, newProject: event.project };
    case "projectFailed":
      return { ...model, newProject: { status: "none" } };
    case "openPanel":
    case "changePanel":
      return { ...model, panel: event.view };
    case "closePanel":
      return closePanel(model, event.picked);
  }
}

/** The provider being connected, so a pick after it names the right one. */
function providerOf(setup: TraceSetupState) {
  if (setup.step !== "traceIn") return null;
  const { scoring } = setup;
  return scoring.status === "pickJudge" || scoring.status === "connecting"
    ? scoring.provider
    : null;
}

/**
 * The first-trace page's state machine: what you do on the page moves it on, and so does what the page tells it
 * (`receive`: a trace arriving, time passing, coming back from the trace). Calls that need the server go through
 * `effects`, and their results move it on again.
 */
export function useTraceSetup({
  start,
  effects,
}: {
  start: TraceSetupStart;
  effects: TraceSetupEffects;
}) {
  const [model, dispatch] = useReducer(
    traceSetupReducer,
    start,
    initialModelOf,
  );

  const createKeys = () => {
    dispatch({ type: "createKeys" });
    effects.createKeys().then(
      (keys) => dispatch({ type: "keysCreated", keys }),
      () => dispatch({ type: "keysFailed" }),
    );
  };
  /** A pick opens a setup, which needs keys: creates them when there are none. */
  const withKeys = (event: TraceSetupEvent) => {
    if (model.keys.status === "none" && model.setup.step !== "traceIn")
      createKeys();
    dispatch(event);
  };

  const actions: TraceSetupActions = {
    pickWay: (way) => withKeys({ type: "pickWay", way }),
    createKeys,
    copy: (part) => {
      dispatch({ type: "copy", part });
      effects.onCopy(part);
    },
    startDemo: () => dispatch({ type: "startDemo" }),
    sendDemoMessage: (question) => {
      dispatch({ type: "demoAsked", question });
      effects.askDemo(question).then(
        ({ answer, trace }) =>
          dispatch({ type: "demoAnswered", answer, trace }),
        () => dispatch({ type: "demoFailed" }),
      );
    },
    leaveDemo: () => dispatch({ type: "leaveDemo" }),
    showNewest: () => dispatch({ type: "showNewest" }),
    skipGate: (gate) => dispatch({ type: "skipGate", gate }),
    resumeGate: (gate) => dispatch({ type: "resumeGate", gate }),
    connectModel: (provider, apiKey) => {
      dispatch({ type: "connectModel", provider });
      effects.connectModel(provider, apiKey).then(
        () => dispatch({ type: "modelConnected", provider }),
        () => dispatch({ type: "modelFailed" }),
      );
    },
    pickJudge: (judge) => {
      const provider = providerOf(model.setup) ?? "";
      dispatch({ type: "pickJudge", judge });
      effects.pickJudge(judge).then(
        (result) =>
          dispatch({
            type: "scored",
            scoring: { status: "scored", ...result },
          }),
        () => dispatch({ type: "judgeFailed", provider }),
      );
    },
    askHalo: effects.askHalo,
    createProject: (name) => {
      dispatch({ type: "createProject" });
      effects.createProject(name).then(
        (project) => dispatch({ type: "projectCreated", project }),
        () => dispatch({ type: "projectFailed" }),
      );
    },
    openPanel: (view) => dispatch({ type: "openPanel", view }),
    changePanel: (view) => dispatch({ type: "changePanel", view }),
    closePanel: (picked) =>
      picked
        ? withKeys({ type: "closePanel", picked })
        : dispatch({ type: "closePanel", picked: null }),
  };

  const receive = {
    traceArrived: (trace: FirstTrace) =>
      dispatch({ type: "traceArrived", trace }),
    timePassed: (secondsSinceLatest: number) =>
      dispatch({ type: "timePassed", secondsSinceLatest }),
    traceOpened: () => dispatch({ type: "traceOpened" }),
  };

  return { model, actions, receive };
}
