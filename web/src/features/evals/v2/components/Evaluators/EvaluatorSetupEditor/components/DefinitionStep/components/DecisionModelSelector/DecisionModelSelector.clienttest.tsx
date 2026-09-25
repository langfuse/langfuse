import { render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { DecisionModelSelector } from "./DecisionModelSelector";

const connection = vi.hoisted(() => ({
  provider: "jev",
  adapter: "typesafe",
  withDefaultModels: true,
  customModels: [] as string[],
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    llmApiKey: {
      all: {
        useQuery: () => ({ isSuccess: true, data: { data: [connection] } }),
      },
    },
  },
}));

describe("DecisionModelSelector", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  beforeEach(() => {
    connection.withDefaultModels = true;
    connection.customModels = [];
  });

  const renderWithSelectedModel = (model: string) => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "DECISION_MODEL",
      mode: "edit",
    });
    store.getState().actions.selectModel({ provider: "jev", model });

    render(
      <DecisionModelSelector
        projectId="project"
        store={store}
        onConfigureProviders={vi.fn()}
      />,
      { wrapper: LayerProvider },
    );

    return screen.getByRole("combobox", { name: "Decision model" });
  };

  it.each([
    ["lists only default models", true],
    ["lists no models", false],
  ])(
    "shows the evaluator's model when its connection %s",
    (_, withDefaultModels) => {
      connection.withDefaultModels = withDefaultModels;

      expect(renderWithSelectedModel("jev-1.13.0")).toHaveTextContent(
        "jev: jev-1.13.0",
      );
    },
  );

  // Duplicate option values make Radix check both rows and render both labels
  // in the trigger.
  it.each([
    ["is also a default model", true, ["jev-latest"]],
    ["is listed twice", false, ["jev-latest", "jev-latest"]],
  ])(
    "lists a custom model once when it %s",
    (_, withDefaultModels, customModels) => {
      connection.withDefaultModels = withDefaultModels;
      connection.customModels = customModels;

      expect(renderWithSelectedModel("jev-latest").textContent).toBe(
        "jev: jev-latest",
      );
    },
  );
});
