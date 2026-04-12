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
  fireEvent.click(
    within(nodeElement).getByTestId("spielwiese-message-insert-text-trigger"),
  );
  fireEvent.click(within(nodeElement).getByRole("button", { name: "Tool" }));

  return within(nodeElement).getByRole("combobox", {
    name: "vision-agent Tool picker",
  });
}

function getInsertControls(nodeElement: HTMLElement) {
  return {
    compactPicker: within(nodeElement).getByTestId(
      "spielwiese-message-insert-picker-compact",
    ),
    compactShell: within(nodeElement).getByTestId(
      "spielwiese-message-insert-compact-shell",
    ),
    compactTrigger: within(nodeElement).getByTestId(
      "spielwiese-message-insert-compact-trigger",
    ),
    insertRow: within(nodeElement).getByTestId("spielwiese-message-insert-row"),
    externalRow: within(nodeElement).getByTestId(
      "spielwiese-message-insert-external-row",
    ),
    textPicker: within(nodeElement).getByTestId(
      "spielwiese-message-insert-picker-text",
    ),
    textShell: within(nodeElement).getByTestId(
      "spielwiese-message-insert-text-shell",
    ),
    textTrigger: within(nodeElement).getByTestId(
      "spielwiese-message-insert-text-trigger",
    ),
  };
}

function expectInsertRowChrome({
  compactPicker,
  compactShell,
  compactTrigger,
  externalRow,
  insertRow,
  textPicker,
  textShell,
  textTrigger,
  visionNode,
}: ReturnType<typeof getInsertControls> & { visionNode: HTMLElement }) {
  const nodeCard = within(visionNode).getByTestId("spielwiese-agent-node-card");

  expect(compactPicker.className).not.toContain("absolute");
  expect(compactPicker.getAttribute("data-state")).toBe("open");
  expect(compactPicker.className).toContain("border-l");
  expect(compactPicker.className).toContain("bg-[rgba(0,0,0,0.035)]");
  expect(textPicker.getAttribute("data-state")).toBe("closed");
  expect(insertRow.parentElement).toBe(
    nodeCard.lastElementChild?.previousElementSibling,
  );
  expect(insertRow.className).toContain("w-fit");
  expect(insertRow.className).toContain("pt-0");
  expect(insertRow.className).toContain("pl-[10px]");
  expect(insertRow.className).toContain("pb-[6px]");
  expect(externalRow.className).toContain("w-fit");
  expect(externalRow.className).toContain("pl-[18px]");
  expect(externalRow.className).toContain("opacity-0");
  expect(externalRow.className).toContain("pointer-events-none");
  expect(externalRow.className).toContain("group-hover/agent-node:opacity-100");
  expect(externalRow.className).toContain(
    "group-hover/agent-node:pointer-events-auto",
  );
  expect(externalRow.className).toContain(
    "group-focus-within/agent-node:opacity-100",
  );
  expect(externalRow.parentElement).toBe(visionNode);
  expect(visionNode.lastElementChild).toBe(externalRow);
  expect(compactShell.className).toContain("overflow-visible");
  expect(compactShell.className).not.toContain("border");
  expect(compactShell.className).not.toContain("bg-background");
  expect(textShell.className).toContain("overflow-hidden");
  expect(textShell.className).toContain("rounded-[8px]");
  expect(compactTrigger.querySelector("svg")).toBeTruthy();
  expect(compactTrigger.getAttribute("aria-expanded")).toBe("true");
  expect(compactTrigger.className).toContain("items-center");
  expect(compactTrigger.className).toContain("justify-center");
  expect(compactTrigger.className).toContain("size-7");
  expect(textTrigger.textContent).toBe("New message");
  expect(textTrigger.getAttribute("aria-expanded")).toBe("false");
  expect(
    nodeCard.lastElementChild?.previousElementSibling?.className,
  ).toContain("gap-0");
}

function renderVisionNode() {
  render(<SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />);
  return screen.getAllByTestId("spielwiese-agent-node")[0];
}

describe("SpielwieseEditorCanvas prompt insertion", () => {
  it("reveals an inline message tray that stays open until toggled closed", () => {
    const visionNode = renderVisionNode();
    const controls = getInsertControls(visionNode);

    controls.compactTrigger.focus();
    fireEvent.click(controls.compactTrigger);

    expectInsertRowChrome({ ...controls, visionNode });

    fireEvent.blur(controls.compactTrigger, { relatedTarget: null });

    expect(controls.compactPicker.getAttribute("data-state")).toBe("open");

    fireEvent.click(controls.textTrigger);

    expect(controls.compactPicker.getAttribute("data-state")).toBe("open");
    expect(controls.textPicker.getAttribute("data-state")).toBe("open");
    expect(controls.compactTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(controls.textTrigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the footer insert control hidden until the node is hovered or focused", () => {
    const visionNode = renderVisionNode();
    const { externalRow, textTrigger } = getInsertControls(visionNode);

    expect(externalRow.className).toContain("opacity-0");
    expect(externalRow.className).toContain("pointer-events-none");

    fireEvent.mouseEnter(visionNode);

    expect(externalRow.className).toContain(
      "group-hover/agent-node:opacity-100",
    );

    textTrigger.focus();

    expect(externalRow.className).toContain(
      "group-focus-within/agent-node:opacity-100",
    );
  });
});

describe("SpielwieseEditorCanvas prompt insertion actions", () => {
  it("lets a node append a new user, system, or assistant message from the footer control", () => {
    const visionNode = renderVisionNode();
    const textTrigger = within(visionNode).getByTestId(
      "spielwiese-message-insert-text-trigger",
    );

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

  it("still inserts a message when the trigger blurs before the option click lands", () => {
    const visionNode = renderVisionNode();
    const compactTrigger = within(visionNode).getByTestId(
      "spielwiese-message-insert-compact-trigger",
    );

    compactTrigger.focus();
    fireEvent.click(compactTrigger);

    const assistantOption = within(visionNode).getByRole("button", {
      name: "Assistant",
    });

    fireEvent.mouseDown(assistantOption);
    fireEvent.blur(compactTrigger, { relatedTarget: null });
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

    fireEvent.click(
      within(visionNode).getByTestId("spielwiese-message-insert-text-trigger"),
    );
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

    fireEvent.click(
      within(visionNode).getByTestId("spielwiese-message-insert-text-trigger"),
    );
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
