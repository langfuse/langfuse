import { render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { DecisionModelSelector } from "./DecisionModelSelector";

vi.mock("@/src/utils/api", () => ({
  api: {
    llmApiKey: {
      all: {
        useQuery: () => ({
          isSuccess: true,
          data: {
            data: [
              {
                provider: "jev",
                adapter: "typesafe",
                withDefaultModels: true,
                customModels: [],
              },
            ],
          },
        }),
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

  it("shows the evaluator's model when its connection no longer lists it", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "DECISION_MODEL",
      mode: "edit",
    });
    store.getState().actions.selectModel({
      provider: "jev",
      model: "jev-1.13.0",
    });

    render(
      <DecisionModelSelector
        projectId="project"
        store={store}
        onConfigureProviders={vi.fn()}
      />,
      { wrapper: LayerProvider },
    );

    expect(
      screen.getByRole("combobox", { name: "Decision model" }),
    ).toHaveTextContent("jev: jev-1.13.0");
  });
});
