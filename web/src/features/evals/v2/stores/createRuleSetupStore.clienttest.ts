import { createRuleSetupStore, isRuleDraftDirty } from "./createRuleSetupStore";

describe("rule setup store", () => {
  const initialDraft = {
    name: "Initial",
    filter: [],
    sampling: 1,
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
});
