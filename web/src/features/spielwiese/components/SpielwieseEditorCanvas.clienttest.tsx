import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function hoverOption(element: HTMLElement) {
  fireEvent.pointerEnter(element);
  fireEvent.pointerMove(element);
}

describe("SpielwieseEditorCanvas layout shell", () => {
  it("renders with a local container-query root", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

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
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    expect(screen.getByDisplayValue("Vision Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("Nutrition Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("Coach Agent")).toBeTruthy();
    expect(screen.getByDisplayValue("[image]")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "vision-agent Model",
      }).textContent,
    ).toContain("GPT-4.1 mini");
    expect(screen.getByDisplayValue("coach_summary")).toBeTruthy();
    expect(
      screen.queryByText(spielwieseEditorCanvasTestCanvas.helper),
    ).toBeNull();
    expect(screen.queryByText("01")).toBeNull();
  });
});

describe("SpielwieseEditorCanvas prompt layout", () => {
  it("renders the user message detached above the node card", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const detachedUserSections = within(visionNode).getByTestId(
      "vision-agent-detached-user-sections",
    );
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );

    expect(
      within(detachedUserSections).getByLabelText("vision-agent User"),
    ).toBeTruthy();
    expect(within(nodeCard).queryByLabelText("vision-agent User")).toBeNull();
  });

  it("renders the instructions section first inside the node card with a flat row and gear icon", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const sectionRows = within(nodeCard).getAllByTestId(
      "spielwiese-message-section-row",
    );
    const instructionsInput = within(nodeCard).getByLabelText(
      "vision-agent Instructions",
    );

    expect(sectionRows[0]?.getAttribute("data-section-id")).toBe("system");
    expect(sectionRows[0]?.className).toContain("rounded-none");
    expect(instructionsInput).toBeTruthy();
    expect(
      within(nodeCard).getByTestId("vision-agent-system-icon"),
    ).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas assistant prompt layout", () => {
  it("renders the assistant section as a receives/responds behavior card", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const behaviorCard = within(nodeCard).getByTestId(
      "spielwiese-assistant-reply-card",
    );

    expect(
      within(nodeCard).getByText("How the assistant should reply"),
    ).toBeTruthy();
    expect(
      within(nodeCard).getByText(
        "When it receives this \u2192 it should respond like this",
      ),
    ).toBeTruthy();
    expect(within(behaviorCard).getByText("RECEIVES")).toBeTruthy();
    expect(within(behaviorCard).getByText("RESPONDS")).toBeTruthy();
    expect(
      within(behaviorCard).getByTestId("spielwiese-assistant-receives-value")
        .textContent,
    ).toContain("[image]");
    expect(
      within(behaviorCard).getByLabelText(
        "vision-agent How the assistant should reply",
      ),
    ).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas editing", () => {
  it("keeps inline fields editable with fixed widths", async () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0]!;
    const titleInput = screen.getByLabelText("vision-agent title");
    const modelInput = screen.getByRole("button", {
      name: "vision-agent Model",
    });
    const systemInput = screen.getByLabelText("vision-agent Instructions");
    const toolCreatorButton = within(visionNode).getByRole("button", {
      name: "Create tool",
    });

    fireEvent.change(titleInput, { target: { value: "Vision Agent Draft" } });
    fireEvent.click(modelInput);

    expect(
      screen.queryByRole("button", { name: "Claude Haiku 4.5" }),
    ).toBeNull();
    expect(screen.queryByText("Token cost")).toBeNull();

    const providerOption = screen.getByRole("button", { name: "Anthropic" });
    hoverOption(providerOption);
    expect(
      screen.getByRole("button", { name: "Claude Opus 4.6" }),
    ).toBeTruthy();
    expect(screen.queryByText("Token cost")).toBeNull();

    const modelOption = screen.getByRole("button", {
      name: "Claude Haiku 4.5",
    });
    hoverOption(modelOption);
    expect(screen.getByText("Token cost")).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
    fireEvent.click(modelOption);
    fireEvent.change(systemInput, {
      target: { value: "Updated system prompt\nwith two fixed lines." },
    });

    expect(screen.getByDisplayValue("Vision Agent Draft")).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "vision-agent Model",
        }).textContent,
      ).toContain("Claude Haiku 4.5");
    });
    expect((systemInput as HTMLTextAreaElement).value).toBe(
      "Updated system prompt\nwith two fixed lines.",
    );
    expect(screen.queryByLabelText("vision-agent step")).toBeNull();
    expect(titleInput.className).toContain("w-full");
    expect(screen.queryByLabelText("vision-agent description")).toBeNull();
    expect(modelInput.className).toContain("min-w-[11rem]");
    expect(systemInput.className).toContain("[field-sizing:content]");
    expect(toolCreatorButton.textContent).toContain("Create tool");
    expect(screen.queryByLabelText("vision-agent tools")).toBeNull();
    expect(systemInput.getAttribute("rows")).toBe("1");
  });
});

describe("SpielwieseEditorCanvas model picker", () => {
  it("reveals older models behind the more-models control", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "vision-agent Model",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    expect(screen.queryByRole("button", { name: "GPT-4.1 mini" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More models" }));

    expect(screen.getByRole("button", { name: "GPT-4.1 mini" })).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas collapse interactions", () => {
  it("lets each node collapse to the header row", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const toggleButton = screen.getByLabelText("Toggle vision-agent node");

    fireEvent.click(toggleButton);

    expect(within(visionNode).getByLabelText("vision-agent User")).toBeTruthy();
    expect(screen.queryByLabelText("vision-agent Instructions")).toBeNull();
    expect(
      screen.queryByLabelText("vision-agent How the assistant should reply"),
    ).toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("lets each prompt section collapse into a single header row preview", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    expect(
      screen.getAllByText(
        /You are a food identification expert\. Identify every food item in the image\./i,
      ),
    ).toHaveLength(1);

    const toggleButton = screen.getByLabelText(
      "Toggle vision-agent Instructions section",
    );

    fireEvent.click(toggleButton);

    expect(screen.queryByLabelText("vision-agent Instructions")).toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.getAllByText(
        /You are a food identification expert\. Identify every food item in the image\./i,
      ),
    ).toHaveLength(1);
  });
});
