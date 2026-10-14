import { createEvaluatorsTableStore } from "./evaluatorsTableStore";

describe("evaluators table selection", () => {
  it("implements the table selection store contract", () => {
    const store = createEvaluatorsTableStore();

    store.getState().actions.toggleRow("evaluator-2", true);

    expect(store.getState()).toMatchObject({
      rowSelection: { "evaluator-2": true },
      selectAll: false,
    });
  });

  it("supports selecting all matching evaluators and leaves that mode when a row is deselected", () => {
    const store = createEvaluatorsTableStore();

    store
      .getState()
      .actions.togglePageRows(["evaluator-1", "evaluator-2"], true);
    store.getState().actions.setSelectAll(true);

    expect(store.getState()).toMatchObject({
      selectAll: true,
    });
    expect(store.getState().rowSelection).toEqual({
      "evaluator-1": true,
      "evaluator-2": true,
    });

    store.getState().actions.toggleRow("evaluator-1", false);

    expect(store.getState()).toMatchObject({
      selectAll: false,
    });
    expect(store.getState().rowSelection).toEqual({
      "evaluator-2": true,
    });
  });
});
