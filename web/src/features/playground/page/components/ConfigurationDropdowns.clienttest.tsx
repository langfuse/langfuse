import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { ConfigurationDropdowns } from "./ConfigurationDropdowns";

const { capture, updatePromptVariableValues } = vi.hoisted(() => ({
  capture: vi.fn(),
  updatePromptVariableValues: vi.fn(),
}));

vi.mock("../context", () => ({
  usePlaygroundContext: () => ({
    tools: [],
    structuredOutputSchema: null,
    messagePlaceholders: [],
    promptVariables: [
      { name: "topic", value: "original topic", isUsed: true },
      { name: "context", value: "original context", isUsed: true },
    ],
    updatePromptVariableValues,
  }),
}));

vi.mock("../hooks/usePlaygroundWindowSize", () => ({
  usePlaygroundWindowSize: () => ({
    width: 600,
    isVeryCompact: false,
    isCompact: false,
  }),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => capture,
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "test-project",
}));

vi.mock("./PlaygroundTools", () => ({
  PlaygroundTools: () => null,
  PlaygroundToolsPopover: () => null,
}));

vi.mock("./StructuredOutputSchemaSection", () => ({
  StructuredOutputSchemaSection: () => null,
  StructuredOutputSchemaPopover: () => null,
}));

vi.mock("./CreateOrEditLLMToolDialog", () => ({
  CreateOrEditLLMToolDialog: () => null,
}));

vi.mock("./CreateOrEditLLMSchemaDialog", () => ({
  CreateOrEditLLMSchemaDialog: () => null,
}));

vi.mock("./Variables", () => ({ Variables: () => null }));
vi.mock("./MessagePlaceholders", () => ({ MessagePlaceholders: () => null }));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ConfigurationDropdowns variable import", () => {
  it("returns to the variables popover after importing or cancelling and captures counts only", async () => {
    render(
      <LayerProvider>
        <ConfigurationDropdowns />
      </LayerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Variables/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));

    expect(
      screen.getByRole("dialog", { name: "Import variables from JSON" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Variables & Message Placeholders",
      }),
    ).not.toBeInTheDocument();

    const values = { topic: "private topic", context: "private\ncontext" };
    fireEvent.change(screen.getByLabelText("Variable values (JSON)"), {
      target: { value: JSON.stringify(values) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import variables" }));

    expect(
      await screen.findByRole("heading", {
        name: "Variables & Message Placeholders",
      }),
    ).toBeInTheDocument();
    expect(updatePromptVariableValues).toHaveBeenCalledExactlyOnceWith(values);
    expect(capture).toHaveBeenCalledExactlyOnceWith(
      "playground:variables_import",
      {
        variableCount: 2,
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));
    fireEvent.change(screen.getByLabelText("Variable values (JSON)"), {
      target: { value: '{"topic":"discarded"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Import variables from JSON" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", {
          name: "Variables & Message Placeholders",
        }),
      ).toBeInTheDocument();
    });
    expect(updatePromptVariableValues).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
