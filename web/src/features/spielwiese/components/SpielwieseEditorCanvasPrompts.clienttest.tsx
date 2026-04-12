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

describe("SpielwieseEditorCanvas node insertion", () => {
  it("keeps prompt insertion scoped to the response format control", () => {
    const visionNode = renderVisionNode();
    const textTrigger = getResponseFormatInsertTrigger(visionNode);

    fireEvent.click(textTrigger);

    expect(
      within(visionNode).getByRole("button", { name: "Assistant" }),
    ).toBeTruthy();
    expect(
      within(visionNode).getByRole("button", { name: "Tool" }),
    ).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas prompt insertion actions", () => {
  it("lets a node append a new user, system, or assistant message from the response format control", () => {
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

  it("opens the add-tool popup from the node header", () => {
    const visionNode = renderVisionNode();
    const createToolButton = within(visionNode).getByRole("button", {
      name: "Create tool",
    });

    fireEvent.click(createToolButton);

    const popup = screen.getByTestId("spielwiese-tool-creator-popup");

    expect(popup).toBeTruthy();
    expect(popup.className).toContain("border-0");
    expect(popup.className).toContain("shadow-none");
    expect(screen.getByText("Add tool")).toBeTruthy();
    expect(screen.getByDisplayValue("get_weather")).toBeTruthy();
    expect(screen.getByText("Connect to endpoint")).toBeTruthy();
    expect(
      within(visionNode).queryByLabelText("vision-agent tools"),
    ).toBeNull();
  });
});

describe("SpielwieseEditorCanvas prompt section controls", () => {
  it("lets a node delete a prompt section", () => {
    const visionNode = renderVisionNode();

    fireEvent.click(getResponseFormatInsertTrigger(visionNode));
    fireEvent.click(
      within(visionNode).getByRole("button", { name: "Assistant" }),
    );
    fireEvent.click(
      within(visionNode).getByLabelText(
        "Delete vision-agent How the assistant should reply message",
      ),
    );

    expect(
      within(visionNode).queryByLabelText(
        "vision-agent How the assistant should reply",
      ),
    ).toBeNull();
    expect(getPromptSectionOrder(visionNode)).toEqual(["user", "system"]);
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
