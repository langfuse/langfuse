import { fireEvent, render, screen } from "@testing-library/react";

import { LLMAdapter } from "@langfuse/shared";

import { PromptModelConfigSection } from "./PromptModelConfigSection";

const mocks = vi.hoisted(() => ({
  connections: [
    {
      provider: "openai-prod",
      adapter: "openai",
      customModels: ["house-model"],
      withDefaultModels: false,
    },
    {
      provider: "anthropic-prod",
      adapter: "anthropic",
      customModels: ["claude-x"],
      withDefaultModels: false,
    },
  ],
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    llmApiKey: {
      all: { useQuery: () => ({ data: { data: mocks.connections } }) },
    },
  },
}));

// Stands in for the shared model picker so the test drives this component's
// write-back contract rather than the picker's popovers.
vi.mock("@/src/components/ModelParameters", () => ({
  ModelParameters: ({
    modelParams,
    updateModelParamValue,
    setModelParamEnabled,
  }: any) => (
    <div>
      <span data-testid="params">{JSON.stringify(modelParams)}</span>
      <button
        onClick={() => {
          updateModelParamValue("provider", "anthropic-prod");
          updateModelParamValue("model", "claude-x");
        }}
      >
        pick anthropic
      </button>
      <button onClick={() => setModelParamEnabled("temperature", true)}>
        enable temperature
      </button>
      <button onClick={() => setModelParamEnabled("temperature", false)}>
        disable temperature
      </button>
      <button
        onClick={() => updateModelParamValue("adapter", LLMAdapter.OpenAI)}
      >
        set adapter
      </button>
    </div>
  ),
}));

const renderSection = (config: Record<string, unknown>) => {
  const onChange = vi.fn();
  render(
    <PromptModelConfigSection
      value={JSON.stringify(config, null, 2)}
      onChange={onChange}
    />,
  );

  return {
    onChange,
    lastConfig: () => JSON.parse(onChange.mock.lastCall?.[0] ?? "{}"),
  };
};

describe("PromptModelConfigSection", () => {
  it("shows the model the config pins", () => {
    renderSection({ provider: "openai-prod", model: "house-model" });

    const params = JSON.parse(screen.getByTestId("params").textContent ?? "{}");
    expect(params.provider.value).toBe("openai-prod");
    expect(params.model.value).toBe("house-model");
  });

  it("enables the pinned parameters and leaves the rest at adapter defaults", () => {
    renderSection({
      provider: "anthropic-prod",
      model: "claude-x",
      temperature: 0.4,
    });

    const params = JSON.parse(screen.getByTestId("params").textContent ?? "{}");
    expect(params.temperature).toEqual({ value: 0.4, enabled: true });
    expect(params.top_p.enabled).toBe(false);
    expect(params.maxTemperature.value).toBe(1);
  });

  it("hides the picker until a model is pinned", () => {
    renderSection({ owner: "growth-team" });

    expect(screen.queryByTestId("params")).not.toBeInTheDocument();
  });

  it("pins a model without disturbing the config's other keys", () => {
    const { lastConfig } = renderSection({ owner: "growth-team" });

    fireEvent.click(screen.getByRole("checkbox"));

    expect(lastConfig()).toEqual({
      owner: "growth-team",
      provider: "openai-prod",
      model: "house-model",
    });
  });

  it("removes only the keys it owns when unpinned", () => {
    const { lastConfig } = renderSection({
      provider: "openai-prod",
      model: "house-model",
      temperature: 0.4,
      owner: "growth-team",
      tools: [{ name: "get_weather" }],
    });

    fireEvent.click(screen.getByRole("checkbox"));

    expect(lastConfig()).toEqual({
      owner: "growth-team",
      tools: [{ name: "get_weather" }],
    });
  });

  it("keeps both halves when the picker sets provider and model in one go", () => {
    const { lastConfig } = renderSection({
      provider: "openai-prod",
      model: "house-model",
    });

    fireEvent.click(screen.getByRole("button", { name: "pick anthropic" }));

    expect(lastConfig()).toEqual({
      provider: "anthropic-prod",
      model: "claude-x",
    });
  });

  it("writes a parameter with its current value when enabled, and drops it when disabled", () => {
    const { lastConfig } = renderSection({
      provider: "anthropic-prod",
      model: "claude-x",
    });

    fireEvent.click(screen.getByRole("button", { name: "enable temperature" }));
    expect(lastConfig()).toHaveProperty("temperature", 0);

    fireEvent.click(
      screen.getByRole("button", { name: "disable temperature" }),
    );
    expect(lastConfig()).not.toHaveProperty("temperature");
  });

  it("never writes params the picker only displays", () => {
    const { onChange } = renderSection({
      provider: "openai-prod",
      model: "house-model",
    });

    fireEvent.click(screen.getByRole("button", { name: "set adapter" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("warns instead of guessing when the pinned settings cannot be read", () => {
    renderSection({ model: "house-model", temperature: "hot" });

    expect(screen.queryByTestId("params")).not.toBeInTheDocument();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });
});
