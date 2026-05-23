import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function getPromptSectionOrder(nodeElement: HTMLElement) {
  return within(nodeElement)
    .getAllByTestId("spielwiese-message-section-row")
    .map((row) => row.getAttribute("data-section-id"));
}

function insertToolMessage(nodeElement: HTMLElement) {
  const nodeCard = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card",
  );

  fireEvent.click(
    within(nodeCard).getByTestId(
      "spielwiese-response-format-insert-text-trigger",
    ),
  );
  fireEvent.click(within(nodeCard).getByRole("button", { name: "Tool" }));

  return within(nodeElement).getByRole("combobox", {
    name: "vision-agent Tool picker",
  });
}

function getResponseFormatInsertTrigger(nodeElement: HTMLElement) {
  const nodeCard = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card",
  );

  return within(nodeCard).getByTestId(
    "spielwiese-response-format-insert-text-trigger",
  );
}

function renderVisionNode() {
  render(<SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />);
  return screen.getAllByTestId("spielwiese-agent-node")[0];
}

async function expectAgentMessageTooltip({
  label,
  pseudoLinkLabel,
  text,
  tooltipTestId,
  visionNode,
}: {
  label: "Assistant" | "Instructions" | "Tool";
  pseudoLinkLabel?: string;
  text: string;
  tooltipTestId: string;
  visionNode: HTMLElement;
}) {
  const trigger = within(visionNode).getByRole("button", { name: label });

  fireEvent.mouseEnter(trigger);
  fireEvent.focus(trigger);

  expect((await screen.findByTestId(tooltipTestId)).textContent).toContain(
    text,
  );

  if (pseudoLinkLabel) {
    expect(screen.getByTestId(`${tooltipTestId}-pseudo-link`).textContent).toBe(
      pseudoLinkLabel,
    );
  }
}

describe("SpielwieseEditorCanvas node insertion", () => {
  it("keeps prompt insertion scoped to the response format control", () => {
    const visionNode = renderVisionNode();
    const textTrigger = getResponseFormatInsertTrigger(visionNode);

    fireEvent.click(textTrigger);

    expect(
      within(visionNode).queryByRole("button", { name: "User" }),
    ).toBeNull();
    expect(
      within(visionNode).getByRole("button", { name: "Instructions" }),
    ).toBeTruthy();
    expect(
      within(visionNode).getByRole("button", { name: "Assistant" }),
    ).toBeTruthy();
    expect(
      within(visionNode).getByRole("button", { name: "Tool" }),
    ).toBeTruthy();
  });

  it("shows minimal tooltips for the agent-only prompt types", async () => {
    const visionNode = renderVisionNode();
    const textTrigger = getResponseFormatInsertTrigger(visionNode);

    fireEvent.click(textTrigger);

    await expectAgentMessageTooltip({
      label: "Instructions",
      text: "What the agent should follow before replying.",
      tooltipTestId:
        "spielwiese-response-format-insert-picker-text-system-tooltip",
      visionNode,
    });
    await expectAgentMessageTooltip({
      label: "Assistant",
      pseudoLinkLabel: "Docs",
      text: "Multi-shot answer expectation for the reply.",
      tooltipTestId:
        "spielwiese-response-format-insert-picker-text-assistant-tooltip",
      visionNode,
    });
    await expectAgentMessageTooltip({
      label: "Tool",
      text: "Expected tool call and returned result.",
      tooltipTestId:
        "spielwiese-response-format-insert-picker-text-tool-tooltip",
      visionNode,
    });
  });
});

describe("SpielwieseEditorCanvas prompt insertion actions", () => {
  it("lets a node append an assistant message from the response format control", () => {
    const visionNode = renderVisionNode();
    const textTrigger = getResponseFormatInsertTrigger(visionNode);

    fireEvent.click(textTrigger);
    fireEvent.click(
      within(visionNode).getByRole("button", { name: "Assistant" }),
    );

    const assistantInputs = within(visionNode).getAllByLabelText(
      "vision-agent How the assistant should reply",
    );

    expect(assistantInputs).toHaveLength(1);
    expect((assistantInputs[0] as HTMLTextAreaElement).value).toBe("");
    expect(
      within(visionNode).queryByRole("button", { name: "Assistant" }),
    ).toBeNull();
  });

  it("still inserts a message when the response format trigger blurs before the option click lands", () => {
    const visionNode = renderVisionNode();
    const textTrigger = getResponseFormatInsertTrigger(visionNode);

    textTrigger.focus();
    fireEvent.click(textTrigger);

    const assistantOption = within(visionNode).getByRole("button", {
      name: "Assistant",
    });

    fireEvent.mouseDown(assistantOption);
    fireEvent.blur(textTrigger, { relatedTarget: null });
    fireEvent.click(assistantOption);

    expect(
      within(visionNode).getAllByLabelText(
        "vision-agent How the assistant should reply",
      ),
    ).toHaveLength(1);
  });
});

describe("SpielwieseEditorCanvas tool messages", () => {
  it("shows only the picker first and reveals sent/back after a tool is picked", () => {
    const visionNode = renderVisionNode();
    const toolPicker = insertToolMessage(visionNode);
    const toolSection = within(visionNode).getByTestId(
      "spielwiese-tool-message-section",
    );

    expect(toolPicker.textContent).toContain("Select a tool...");
    expect(toolSection.className).toContain("bg-muted/18");
    expect(toolSection.className).not.toContain("bg-light-yellow/70");
    expect(within(visionNode).queryByText("Ready")).toBeNull();
    expect(within(visionNode).queryByText("Example I/O")).toBeNull();
    expect(
      within(visionNode).queryByLabelText("vision-agent Tool sent"),
    ).toBeNull();
    expect(
      within(visionNode).queryByLabelText("vision-agent Tool back"),
    ).toBeNull();

    fireEvent.click(toolPicker);

    const toolOption = screen.getByRole("option", { name: "nutrition_lookup" });
    fireEvent.mouseMove(toolOption);
    fireEvent.click(toolOption);

    expect(toolPicker.textContent).toContain("nutrition_lookup");
    expect(within(visionNode).queryByText("Ready")).toBeNull();
    expect(
      within(visionNode).getByDisplayValue(/"food": "grilled salmon"/),
    ).toBeTruthy();
    expect(within(visionNode).getByDisplayValue(/"kcal": 208/)).toBeTruthy();
  });

  it("keeps the add-tool trigger inert in the prototype header", () => {
    const visionNode = renderVisionNode();
    const createToolButton = within(visionNode).getByRole("button", {
      name: "Create tool",
    });

    fireEvent.click(createToolButton);

    expect(createToolButton.getAttribute("aria-disabled")).toBe("true");
    expect(createToolButton.getAttribute("tabindex")).toBe("-1");
    expect(createToolButton.className).toContain("pointer-events-none");
    expect(createToolButton.className).toContain("cursor-default");
    expect(screen.queryByTestId("spielwiese-tool-creator-popup")).toBeNull();
    expect(
      within(visionNode).queryByLabelText("vision-agent tools"),
    ).toBeNull();
  });
});

describe("SpielwieseEditorCanvas prompt section controls", () => {
  it("keeps the delete prompt-section control inert", () => {
    const visionNode = renderVisionNode();

    fireEvent.click(getResponseFormatInsertTrigger(visionNode));
    fireEvent.click(
      within(visionNode).getByRole("button", { name: "Assistant" }),
    );
    const deleteButton = within(visionNode).getByLabelText(
      "Delete vision-agent How the assistant should reply message",
    );
    fireEvent.click(deleteButton);

    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
    expect(deleteButton.getAttribute("tabindex")).toBe("-1");
    expect(deleteButton.className).toContain("pointer-events-none");
    expect(
      within(visionNode).getByLabelText(
        "vision-agent How the assistant should reply",
      ),
    ).toBeTruthy();
    expect(getPromptSectionOrder(visionNode)).toEqual([
      "user",
      "system",
      "assistant",
    ]);
  });

  it("lets a node move prompt sections to switch positions", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];

    expect(getPromptSectionOrder(visionNode)).toEqual(["user", "system"]);

    fireEvent.click(getResponseFormatInsertTrigger(visionNode));
    fireEvent.click(
      within(visionNode).getByRole("button", { name: "Assistant" }),
    );

    expect(getPromptSectionOrder(visionNode)).toEqual([
      "user",
      "system",
      "assistant",
    ]);

    insertToolMessage(visionNode);

    expect(getPromptSectionOrder(visionNode)).toEqual([
      "user",
      "system",
      "assistant",
      "tool",
    ]);

    fireEvent.click(
      within(visionNode).getByLabelText("Move vision-agent Tool message up"),
    );

    expect(getPromptSectionOrder(visionNode)).toEqual([
      "user",
      "system",
      "tool",
      "assistant",
    ]);
  });
});
