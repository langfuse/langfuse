import { describe, expect, it } from "vitest";

import {
  createRuleSetupStore,
  isRuleDraftDirty,
  isRuleDraftValid,
} from "./createRuleSetupStore";

describe("isRuleDraftValid", () => {
  it("allows a disabled observation rule without assignments", () => {
    const store = createRuleSetupStore({
      name: "Disabled rule",
      filter: [],
      sampling: 1,
      assignments: [],
      triggerKind: "OBSERVATION",
      scoreResultTrigger: null,
    });

    expect(isRuleDraftValid(store.getState(), false)).toBe(true);
    expect(isRuleDraftValid(store.getState(), true)).toBe(false);
  });

  it("still requires a valid evaluator result trigger", () => {
    const store = createRuleSetupStore({
      name: "Invalid result rule",
      filter: [],
      sampling: 1,
      assignments: [],
      triggerKind: "SCORE_RESULT",
      scoreResultTrigger: null,
    });

    expect(isRuleDraftValid(store.getState(), false)).toBe(false);
    expect(isRuleDraftValid(store.getState(), false, true)).toBe(true);
  });
});

describe("rule setup store", () => {
  const initialDraft = {
    name: "Initial",
    filter: [],
    sampling: 1,
    triggerKind: "OBSERVATION" as const,
    scoreResultTrigger: null,
    assignments: [
      {
        evaluatorId: "first",
        evaluatorName: "First",
        evaluatorType: "LLM_AS_JUDGE" as const,
        defaultVariableMapping: [],
        variableMapping: null,
      },
      {
        evaluatorId: "second",
        evaluatorName: "Second",
        evaluatorType: "LLM_AS_JUDGE" as const,
        defaultVariableMapping: [],
        variableMapping: null,
      },
    ],
  };

  it("preserves unrelated references when one field changes", () => {
    const store = createRuleSetupStore(initialDraft);
    const before = store.getState();

    store.getState().actions.setName("Changed");

    expect(store.getState().filter).toBe(before.filter);
    expect(store.getState().assignments).toBe(before.assignments);
  });

  it("only replaces the assignment whose mapping changes", () => {
    const store = createRuleSetupStore(initialDraft);
    const before = store.getState().assignments;

    store.getState().actions.setVariableMapping("first", []);

    expect(store.getState().assignments[0]).not.toBe(before[0]);
    expect(store.getState().assignments[1]).toBe(before[1]);
  });

  it("tracks whether the persisted rule draft actually changed", () => {
    const store = createRuleSetupStore(initialDraft);

    expect(isRuleDraftDirty(store.getState())).toBe(false);

    store.getState().actions.setSampling(0.5);

    expect(isRuleDraftDirty(store.getState())).toBe(true);
  });

  it("does not treat automatic sample selection as a rule change", () => {
    const store = createRuleSetupStore(initialDraft);

    store.getState().actions.setSelectedObservation({ id: "sample" } as never);

    expect(isRuleDraftDirty(store.getState())).toBe(false);
  });

  it("preserves observation settings while switching trigger kinds", () => {
    const filter = [{ type: "string", column: "name" }] as never;
    const scoreResultTrigger = {
      evaluatorId: "source-evaluator",
      predicates: [
        {
          scoreName: "quality",
          dataType: "NUMERIC" as const,
          operator: ">" as const,
          value: 0.5,
        },
      ],
    };
    const store = createRuleSetupStore({
      ...initialDraft,
      filter,
      sampling: 0.25,
      scoreResultTrigger,
    });

    store.getState().actions.setTriggerKind("SCORE_RESULT");
    store.getState().actions.setTriggerKind("OBSERVATION");

    expect(store.getState()).toMatchObject({
      filter,
      sampling: 0.25,
      scoreResultTrigger,
    });
  });
});
