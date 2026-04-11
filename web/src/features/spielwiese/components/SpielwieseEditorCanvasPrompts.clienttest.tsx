import { fireEvent, render, screen, within } from "@testing-library/react";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function getPromptSectionOrder(nodeElement: HTMLElement) {
  return within(nodeElement)
    .getAllByTestId("spielwiese-message-section-row")
    .map((row) => row.getAttribute("data-section-id"));
}

function insertToolMessage(nodeElement: HTMLElement) {
  fireEvent.click(
    within(nodeElement).getByRole("button", {
      name: "New message",
    }),
  );
  fireEvent.click(within(nodeElement).getByRole("button", { name: "Tool" }));

  return within(nodeElement).getByRole("combobox", {
    name: "vision-agent Tool picker",
  });
}

describe("SpielwieseEditorCanvas prompt insertion", () => {
  it("shows the new-message picker to the right and dismisses it when focus leaves", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const newMessageButton = within(visionNode).getByRole("button", {
      name: "New message",
    });

    newMessageButton.focus();
    fireEvent.click(newMessageButton);

    const picker = within(visionNode).getByTestId(
      "spielwiese-message-insert-picker",
    );
    const insertRow = within(visionNode).getByTestId(
      "spielwiese-message-insert-row",
    );

    expect(picker.className).toContain("left-full");
    expect(picker.className).toContain("-translate-y-1/2");
    expect(insertRow.className).toContain("w-fit");

    fireEvent.blur(newMessageButton, { relatedTarget: null });

    expect(
      within(visionNode).queryByTestId("spielwiese-message-insert-picker"),
    ).toBeNull();
  });
});

describe("SpielwieseEditorCanvas prompt insertion actions", () => {
  it("lets a node append a new user, system, or assistant message from the footer control", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const newMessageButton = within(visionNode).getByRole("button", {
      name: "New message",
    });

    fireEvent.click(newMessageButton);
    fireEvent.click(
      within(visionNode).getByRole("button", { name: "Assistant" }),
    );

    const assistantInputs = within(visionNode).getAllByLabelText(
      "vision-agent How the assistant should reply",
    );

    expect(assistantInputs).toHaveLength(2);
    expect((assistantInputs[1] as HTMLTextAreaElement).value).toBe("");
    expect(
      within(visionNode).queryByRole("button", { name: "Assistant" }),
    ).toBeNull();
  });

  it("still inserts a message when the trigger blurs before the option click lands", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const newMessageButton = within(visionNode).getByRole("button", {
      name: "New message",
    });

    newMessageButton.focus();
    fireEvent.click(newMessageButton);

    const assistantOption = within(visionNode).getByRole("button", {
      name: "Assistant",
    });

    fireEvent.mouseDown(assistantOption);
    fireEvent.blur(newMessageButton, { relatedTarget: null });
    fireEvent.click(assistantOption);

    expect(
      within(visionNode).getAllByLabelText(
        "vision-agent How the assistant should reply",
      ),
    ).toHaveLength(2);
  });
});

describe("SpielwieseEditorCanvas tool messages", () => {
  it("shows only the picker first and reveals sent/back after a tool is picked", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const toolPicker = insertToolMessage(visionNode);
    const toolSection = within(visionNode).getByTestId(
      "spielwiese-tool-message-section",
    );

    expect(toolPicker.textContent).toContain("Select a tool...");
    expect(toolSection.className).toContain("bg-light-yellow/70");
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
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
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
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];

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
