import { fireEvent, render, screen } from "@testing-library/react";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";

const canvas = {
  title: "Assistant",
  helper: "Start from a blank page and shape the structure from the rail.",
  stats: [
    {
      id: "blocks",
      label: "Blocks",
      value: "01",
    },
  ],
  agentNodes: [
    {
      id: "vision-agent",
      stepLabel: "Step 1",
      title: "Vision Agent",
      description: "identifies + estimates",
      kind: "Classifier",
      settings: [
        { id: "model", label: "Model", value: "GPT-4.1 mini" },
        { id: "input", label: "Input", value: "meal_photo" },
        { id: "output", label: "Output", value: "detected_foods" },
        { id: "temperature", label: "Temperature", value: "0.1" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[image]" },
        {
          id: "system",
          label: "System",
          value:
            'You are a food identification expert. Identify every food item in the image.\nReturn ONLY JSON:\n[{"item":"grilled salmon","estimated_weight_g":180}, ...]',
        },
        { id: "assistant", label: "Assistant", value: "[JSON]" },
      ],
      notes: [
        { id: "tools", value: "No tools." },
        { id: "mode", value: "Pure vision." },
      ],
    },
    {
      id: "nutrition-agent",
      stepLabel: "Step 2",
      title: "Nutrition Agent",
      description: "calculates everything",
      kind: "Calculator",
      settings: [
        { id: "model", label: "Model", value: "GPT-4.1" },
        { id: "input", label: "Input", value: "detected_foods" },
        { id: "output", label: "Output", value: "macro_estimates" },
        { id: "temperature", label: "Temperature", value: "0.2" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[JSON from Step 1]" },
        {
          id: "system",
          label: "System",
          value:
            'You are a clinical nutritionist.\nUse USDA FoodData Central values.\nReturn ONLY JSON:\n{"items":[...],"totals":{...}}',
        },
        { id: "assistant", label: "Assistant", value: "[JSON]" },
      ],
      notes: [{ id: "source", value: "USDA FoodData Central" }],
    },
    {
      id: "coach-agent",
      stepLabel: "Step 3",
      title: "Coach Agent",
      description: "turns data into guidance",
      kind: "Responder",
      settings: [
        { id: "model", label: "Model", value: "GPT-4o mini" },
        { id: "input", label: "Input", value: "macro_estimates" },
        { id: "output", label: "Output", value: "coach_summary" },
        { id: "temperature", label: "Temperature", value: "0.4" },
      ],
      promptSections: [
        { id: "user", label: "User", value: "[JSON from Step 2]" },
        {
          id: "system",
          label: "System",
          value: "You are a nutrition coach.\nReturn natural language only.",
        },
        { id: "assistant", label: "Assistant", value: "[final summary]" },
      ],
      notes: [{ id: "tools", value: "No tools." }],
    },
  ],
};

describe("SpielwieseEditorCanvas layout", () => {
  it("renders with a local container-query root", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    const widget = screen.getByTestId("spielwiese-editor-canvas");
    const panes = screen.getAllByTestId("spielwiese-editor-canvas-pane");
    const nodes = screen.getAllByTestId("spielwiese-agent-node");
    expect(widget.className).toContain("@container");
    expect(widget.className).toContain("h-full");
    expect(widget.className).toContain("overflow-hidden");
    expect(widget.className).toContain("flex-1");
    expect(panes).toHaveLength(1);
    expect(panes[0]?.className).toContain("rounded-lg");
    expect(nodes).toHaveLength(3);
  });

  it("renders three agent nodes with visible settings and no stats footer", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    expect(screen.getByDisplayValue("Vision Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("Nutrition Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("Coach Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("[image]")).toBeTruthy();
    expect(screen.getByDisplayValue("GPT-4.1 mini")).toBeTruthy();
    expect(screen.getByDisplayValue("coach_summary")).toBeTruthy();
    expect(screen.queryByText(canvas.helper)).toBeNull();
    expect(screen.queryByText("01")).toBeNull();
  });
});

describe("SpielwieseEditorCanvas interactions", () => {
  it("keeps inline fields editable with fixed widths", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    const titleInput = screen.getByLabelText("vision-agent title");
    const modelInput = screen.getByLabelText("vision-agent Model");
    const systemInput = screen.getByLabelText("vision-agent System");

    fireEvent.change(titleInput, { target: { value: "Vision Agent Draft" } });
    fireEvent.change(modelInput, { target: { value: "GPT-4.1 nano" } });
    fireEvent.change(systemInput, {
      target: { value: "Updated system prompt\nwith two fixed lines." },
    });

    expect(screen.getByDisplayValue("Vision Agent Draft")).toBeTruthy();
    expect(screen.getByDisplayValue("GPT-4.1 nano")).toBeTruthy();
    expect((systemInput as HTMLTextAreaElement).value).toBe(
      "Updated system prompt\nwith two fixed lines.",
    );
    expect(screen.queryByLabelText("vision-agent tools")).toBeNull();
    expect(screen.queryByLabelText("vision-agent step")).toBeNull();
    expect(titleInput.className).toContain("w-full");
    expect(screen.queryByLabelText("vision-agent description")).toBeNull();
    expect(modelInput.className).toContain("w-[6.75rem]");
    expect(systemInput.className).toContain("h-full");
  });

  it("lets each node collapse to the header row", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    const toggleButton = screen.getByLabelText("Toggle vision-agent node");

    fireEvent.click(toggleButton);

    expect(screen.queryByLabelText("vision-agent User")).toBeNull();
    expect(screen.queryByLabelText("vision-agent System")).toBeNull();
    expect(screen.queryByLabelText("vision-agent Assistant")).toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("lets each prompt section collapse into a single header row preview", () => {
    render(<SpielwieseEditorCanvas canvas={canvas} />);

    const toggleButton = screen.getByLabelText(
      "Toggle vision-agent System section",
    );

    fireEvent.click(toggleButton);

    expect(screen.queryByLabelText("vision-agent System")).toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.getByText(
        /You are a food identification expert\. Identify every food item in the image\./i,
      ),
    ).toBeTruthy();
  });
});
