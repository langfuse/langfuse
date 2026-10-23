// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  agentTurn,
  appTrace,
  demoTrace,
} from "./components/TracePreview/TracePreview.fixtures";
import type { FirstTrace, TraceSetupModel, TraceSetupState } from "./types";
import {
  initialModelOf,
  traceSetupReducer,
  type TraceSetupEvent,
} from "./useTraceSetup";

const keys = { publicKey: "pk-lf-1", secretKey: "sk-lf-1" };
const app = { kind: "app", integration: null } as const;
const langchain = { kind: "app", integration: "langchain" } as const;
const claudeCode = { kind: "agent", slug: "claude-code" } as const;
const newerTrace: FirstTrace = { ...appTrace, id: "trace-2" };

const opened = (setup: TraceSetupState): TraceSetupModel =>
  initialModelOf({
    setup,
    keys: { status: "none" },
    newProject: { status: "none" },
  });

const run = (model: TraceSetupModel, ...events: TraceSetupEvent[]) =>
  events.reduce(traceSetupReducer, model);

const traceInOf = (model: TraceSetupModel) => {
  if (model.setup.step !== "traceIn") throw new Error(model.setup.step);
  return model.setup;
};

describe("opening", () => {
  it("animates nothing until something changes in front of you", () => {
    expect(opened({ step: "wayIn" })).toMatchObject({
      shouldAnimate: false,
      panel: null,
      returnedTo: null,
    });
  });
});

describe("picking a way", () => {
  it("opens its setup with nothing copied, and changes animate from then on", () => {
    expect(
      run(opened({ step: "wayIn" }), { type: "pickWay", way: app }),
    ).toMatchObject({
      setup: { step: "setup", way: app, copied: { env: false, setup: false } },
      shouldAnimate: true,
    });
  });

  it("keeps the env copy when switching in place, but not the setup's", () => {
    const model = run(
      opened({ step: "setup", way: app, copied: { env: true, setup: true } }),
      { type: "pickWay", way: langchain },
    );
    expect(model.setup).toEqual({
      step: "setup",
      way: langchain,
      copied: { env: true, setup: false },
    });
  });

  it("does nothing once a trace is in", () => {
    const model = run(opened({ step: "wayIn" }), {
      type: "traceArrived",
      trace: appTrace,
    });
    expect(run(model, { type: "pickWay", way: claudeCode })).toBe(model);
  });

  it("from the demo chat hands over to the app's setup", () => {
    const model = run(
      opened({ step: "wayIn" }),
      { type: "startDemo" },
      { type: "pickWay", way: app },
    );
    expect(model.setup.step).toBe("setup");
  });
});

describe("keys", () => {
  it("are created once, then ready", () => {
    const model = run(opened({ step: "wayIn" }), { type: "createKeys" });
    expect(model.keys).toEqual({ status: "creating" });
    expect(run(model, { type: "createKeys" })).toBe(model);
    expect(run(model, { type: "keysCreated", keys }).keys).toEqual({
      status: "ready",
      keys,
    });
  });

  it("go back to none when creating them fails, so they can be tried again", () => {
    expect(
      run(
        opened({ step: "wayIn" }),
        { type: "createKeys" },
        { type: "keysFailed" },
      ).keys,
    ).toEqual({
      status: "none",
    });
  });

  it("can't be created without the role", () => {
    const model = {
      ...opened({ step: "wayIn" }),
      keys: { status: "noAccess" },
    } as const;
    expect(run(model, { type: "createKeys" })).toBe(model);
  });
});

describe("copy checks", () => {
  it("check off the setup card's step", () => {
    const model = run(
      opened({ step: "wayIn" }),
      { type: "pickWay", way: app },
      { type: "copy", part: "env" },
    );
    expect(model.setup).toMatchObject({ copied: { env: true, setup: false } });
  });

  it("leave the card alone while the panel stands in for it", () => {
    const model = run(
      opened({ step: "setup", way: app, copied: { env: false, setup: false } }),
      {
        type: "openPanel",
        view: {
          kind: "browse",
          category: null,
          isReturn: false,
          project: "this",
        },
      },
    );
    expect(run(model, { type: "copy", part: "setup" })).toBe(model);
  });
});

describe("the demo chat", () => {
  it("asks, then fills the answer and its trace into the same turn", () => {
    const asked = run(
      opened({ step: "wayIn" }),
      { type: "startDemo" },
      { type: "demoAsked", question: "Hi?" },
    );
    expect(asked.setup).toEqual({
      step: "demo",
      turns: [{ question: "Hi?", answer: null, trace: null }],
    });
    expect(
      run(asked, { type: "demoAnswered", answer: "Hello", trace: demoTrace })
        .setup,
    ).toEqual({
      step: "demo",
      turns: [{ question: "Hi?", answer: "Hello", trace: demoTrace }],
    });
  });

  it("drops a question whose answer failed, and keeps answered ones", () => {
    const model = run(
      opened({ step: "demo", turns: [] }),
      { type: "demoAsked", question: "One?" },
      { type: "demoAnswered", answer: "Yes", trace: demoTrace },
      { type: "demoAsked", question: "Two?" },
      { type: "demoFailed" },
    );
    expect(model.setup).toEqual({
      step: "demo",
      turns: [{ question: "One?", answer: "Yes", trace: demoTrace }],
    });
  });

  it("leaves back to the ways in", () => {
    expect(
      run(opened({ step: "demo", turns: [] }), { type: "leaveDemo" }).setup,
    ).toEqual({ step: "wayIn" });
  });

  it("only starts from the ways in", () => {
    const model = opened({
      step: "setup",
      way: app,
      copied: { env: false, setup: false },
    });
    expect(run(model, { type: "startDemo" })).toBe(model);
  });
});

describe("a trace arriving", () => {
  const listening = opened({
    step: "setup",
    way: app,
    copied: { env: true, setup: true },
  });

  it("opens the receipt, unscored, with nothing skipped", () => {
    expect(
      traceInOf(run(listening, { type: "traceArrived", trace: appTrace })),
    ).toEqual({
      step: "traceIn",
      trace: appTrace,
      newer: null,
      isNewerShown: false,
      traceCount: 1,
      secondsSinceLatest: 0,
      scoring: { status: "noModel" },
      skippedGates: [],
      hasOpenedTrace: false,
    });
  });

  it("closes a pick for this project, so the trace shows itself", () => {
    const model = run(
      listening,
      {
        type: "openPanel",
        view: {
          kind: "browse",
          category: null,
          isReturn: false,
          project: "this",
        },
      },
      { type: "traceArrived", trace: appTrace },
    );
    expect(model.panel).toBeNull();
  });

  it("animates when it lands in front of you, and not when the page opened on it", () => {
    expect(
      run(listening, { type: "traceArrived", trace: appTrace }).shouldAnimate,
    ).toBe(true);
    const openedOnTrace = run(listening, {
      type: "traceArrived",
      trace: appTrace,
    });
    const reopened = { ...openedOnTrace, shouldAnimate: false };
    const later = run(
      reopened,
      { type: "traceArrived", trace: newerTrace },
      { type: "showNewest" },
      { type: "connectModel", provider: "OpenAI" },
      { type: "skipGate", gate: "shared" },
      { type: "timePassed", secondsSinceLatest: 30 },
    );
    expect(later.shouldAnimate).toBe(false);
  });

  it("after the first, counts up and waits for show", () => {
    const model = run(
      listening,
      { type: "traceArrived", trace: appTrace },
      { type: "timePassed", secondsSinceLatest: 40 },
      { type: "traceArrived", trace: newerTrace },
    );
    expect(traceInOf(model)).toMatchObject({
      trace: appTrace,
      newer: newerTrace,
      traceCount: 2,
      secondsSinceLatest: 0,
    });
  });

  it("show swaps the newer one in", () => {
    const model = run(
      listening,
      { type: "traceArrived", trace: appTrace },
      { type: "traceArrived", trace: newerTrace },
      { type: "showNewest" },
    );
    expect(traceInOf(model)).toMatchObject({
      trace: newerTrace,
      newer: null,
      isNewerShown: true,
    });
  });

  it("show with nothing newer changes nothing", () => {
    const model = run(listening, { type: "traceArrived", trace: appTrace });
    expect(traceInOf(run(model, { type: "showNewest" }))).toEqual(
      traceInOf(model),
    );
  });

  it("coming back from the trace offers the other way in", () => {
    const model = run(
      listening,
      { type: "traceArrived", trace: agentTurn },
      { type: "traceOpened" },
    );
    expect(traceInOf(model).hasOpenedTrace).toBe(true);
  });
});

describe("gates", () => {
  const traceIn = run(opened({ step: "wayIn" }), {
    type: "traceArrived",
    trace: appTrace,
  });

  it("skip once each, in the order skipped, and resume", () => {
    const skipped = run(
      traceIn,
      { type: "skipGate", gate: "keepsWorking" },
      { type: "skipGate", gate: "nothingBroken" },
      { type: "skipGate", gate: "keepsWorking" },
    );
    expect(traceInOf(skipped).skippedGates).toEqual([
      "keepsWorking",
      "nothingBroken",
    ]);
    expect(
      traceInOf(run(skipped, { type: "resumeGate", gate: "keepsWorking" }))
        .skippedGates,
    ).toEqual(["nothingBroken"]);
  });

  it("are ignored before a trace is in", () => {
    const model = opened({ step: "wayIn" });
    expect(run(model, { type: "skipGate", gate: "shared" })).toBe(model);
  });
});

describe("scoring", () => {
  const traceIn = run(opened({ step: "wayIn" }), {
    type: "traceArrived",
    trace: appTrace,
  });
  const scoringOf = (...events: TraceSetupEvent[]) =>
    traceInOf(run(traceIn, ...events)).scoring;
  const scored = {
    status: "scored",
    score: { name: "Helpfulness", value: 0.9, reason: "Direct." },
    evaluatorHref: "#e",
  } as const;

  it("connects a model, picks a judge, and lands the score", () => {
    expect(scoringOf({ type: "connectModel", provider: "OpenAI" })).toEqual({
      status: "connecting",
      provider: "OpenAI",
    });
    expect(
      scoringOf(
        { type: "connectModel", provider: "OpenAI" },
        { type: "modelConnected", provider: "OpenAI" },
      ),
    ).toEqual({ status: "pickJudge", provider: "OpenAI" });
    expect(scoringOf({ type: "pickJudge", judge: "Helpfulness" })).toEqual({
      status: "judging",
      judge: "Helpfulness",
    });
    expect(scoringOf({ type: "scored", scoring: scored })).toEqual(scored);
  });

  it("falls back a step when the key or the judge fails", () => {
    expect(
      scoringOf(
        { type: "connectModel", provider: "OpenAI" },
        { type: "modelFailed" },
      ),
    ).toEqual({
      status: "noModel",
    });
    expect(
      scoringOf(
        { type: "pickJudge", judge: "Helpfulness" },
        { type: "judgeFailed", provider: "OpenAI" },
      ),
    ).toEqual({ status: "pickJudge", provider: "OpenAI" });
  });
});

describe("the new project", () => {
  it("is created, ready, or back to none when it fails", () => {
    const creating = run(opened({ step: "wayIn" }), { type: "createProject" });
    expect(creating.newProject).toEqual({ status: "creating" });
    const ready = {
      status: "ready",
      name: "Agents",
      href: "#p",
      keys,
    } as const;
    expect(
      run(creating, { type: "projectCreated", project: ready }).newProject,
    ).toEqual(ready);
    expect(run(creating, { type: "projectFailed" }).newProject).toEqual({
      status: "none",
    });
  });
});

describe("the panel", () => {
  const browse = {
    kind: "browse",
    category: null,
    isReturn: false,
    project: "this",
  } as const;

  it("closing returns to the row before a way is picked", () => {
    const model = run(
      opened({ step: "wayIn" }),
      { type: "openPanel", view: browse },
      { type: "closePanel", picked: null },
    );
    expect(model).toMatchObject({
      panel: null,
      returnedTo: "row",
      setup: { step: "wayIn" },
    });
  });

  it("a pick closes it into the setup card", () => {
    const model = run(
      opened({ step: "setup", way: app, copied: { env: false, setup: false } }),
      { type: "openPanel", view: browse },
      { type: "changePanel", view: { ...browse, category: "frameworks" } },
      { type: "closePanel", picked: langchain },
    );
    expect(model).toMatchObject({
      panel: null,
      returnedTo: "card",
      setup: { step: "setup", way: langchain },
    });
  });
});
