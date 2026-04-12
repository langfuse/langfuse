import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function getExternalInsertControls() {
  const insertFooter = screen.getByTestId(
    "spielwiese-agent-node-insert-footer",
  );

  return {
    insertFooter,
    externalRow: within(insertFooter).getByTestId(
      "spielwiese-agent-node-external-insert-row",
    ),
    textPicker: within(insertFooter).getByTestId(
      "spielwiese-agent-node-insert-picker",
    ),
    textShell: within(insertFooter).getByTestId(
      "spielwiese-agent-node-insert-shell",
    ),
    textTrigger: within(insertFooter).getByTestId(
      "spielwiese-agent-node-insert-trigger",
    ),
  };
}

function expectExternalInsertRowChrome({
  externalRow,
  insertFooter,
  textPicker,
  textShell,
  textTrigger,
}: ReturnType<typeof getExternalInsertControls>) {
  const stack = screen.getByTestId("spielwiese-agent-node-stack");
  const paneSurface = screen.getByTestId(
    "spielwiese-editor-canvas-pane-surface",
  );

  expect(textPicker.getAttribute("data-state")).toBe("closed");
  expect(externalRow.className).toContain("w-fit");
  expect(externalRow.className).toContain("pl-[18px]");
  expect(externalRow.className).toContain("ml-[18px]");
  expect(externalRow.className).toContain("mt-[8px]");
  expect(externalRow.className).toContain("opacity-100");
  expect(externalRow.className).toContain("pointer-events-auto");
  expect(externalRow.className).not.toContain("opacity-0");
  expect(externalRow.className).not.toContain("pointer-events-none");
  expect(externalRow.className).not.toContain("group-hover/agent-node");
  expect(externalRow.className).not.toContain("group-focus-within/agent-node");
  expect(insertFooter.className).toContain("flex-none");
  expect(insertFooter.className).toContain("pb-2");
  expect(insertFooter.contains(externalRow)).toBe(true);
  expect(paneSurface.contains(insertFooter)).toBe(true);
  expect(
    stack.querySelector("[data-testid='spielwiese-agent-node-insert-slot']"),
  ).toBeNull();
  expect(textShell.className).toContain("overflow-hidden");
  expect(textShell.className).toContain("[--message-insert-inner-radius:7px]");
  expect(textShell.className).toContain("[--message-insert-padding:2px]");
  expect(textShell.className).toContain(
    "rounded-[var(--message-insert-outer-radius)]",
  );
  expect(textShell.className).toContain("p-[var(--message-insert-padding)]");
  expect(textTrigger.className).toContain(
    "rounded-[calc(var(--agent-node-insert-outer-radius)-var(--agent-node-insert-padding))]",
  );
  expect(textTrigger.className).toContain("h-full");
  expect(textTrigger.textContent).toBe("New node");
  expect(textTrigger.getAttribute("aria-expanded")).toBe("false");
}

function expectExternalInsertPickerChrome(nodeElement: HTMLElement) {
  const textPicker = within(nodeElement).getByTestId(
    "spielwiese-agent-node-insert-picker",
  );
  const pickerButtons = ["User", "Agent"].map((label) =>
    within(nodeElement).getByRole("button", { name: label }),
  );
  const pickerButtonRow = pickerButtons[0]?.parentElement as HTMLElement;

  expect(textPicker.className).toContain(
    "rounded-r-[calc(var(--agent-node-insert-outer-radius)-var(--agent-node-insert-padding))]",
  );
  expect(pickerButtonRow.className).toContain(
    "px-[var(--agent-node-insert-padding)]",
  );
  expect(pickerButtonRow.className).toContain("gap-px");
  for (const pickerButton of pickerButtons) {
    expect(pickerButton.className).toContain(
      "rounded-[calc(var(--agent-node-insert-outer-radius)-var(--agent-node-insert-padding))]",
    );
  }
  expect(
    within(nodeElement).queryByRole("button", { name: "Assistant" }),
  ).toBeNull();
  expect(
    within(nodeElement).queryByRole("button", { name: "Instructions" }),
  ).toBeNull();
  expect(
    within(nodeElement).queryByRole("button", { name: "Tool" }),
  ).toBeNull();
}

function renderVisionNode() {
  render(<SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />);
  return screen.getAllByTestId("spielwiese-agent-node")[0];
}

// eslint-disable-next-line max-lines-per-function
describe("SpielwieseEditorCanvas node insertion", () => {
  it("keeps a single trailing external node insert tray with only user and agent choices", () => {
    const visionNode = renderVisionNode();
    const controls = getExternalInsertControls();

    expect(
      screen.getAllByTestId("spielwiese-agent-node-external-insert-row"),
    ).toHaveLength(1);
    expect(
      within(visionNode).queryByTestId(
        "spielwiese-agent-node-external-insert-row",
      ),
    ).toBeNull();
    expectExternalInsertRowChrome(controls);

    fireEvent.click(controls.textTrigger);

    expect(controls.textPicker.getAttribute("data-state")).toBe("open");
    expect(controls.textTrigger.getAttribute("aria-expanded")).toBe("true");
    expectExternalInsertPickerChrome(controls.insertFooter);
  });

  it("inserts a blank agent-only node after the current node when the external agent option is chosen", () => {
    renderVisionNode();
    const { insertFooter, textTrigger } = getExternalInsertControls();

    fireEvent.click(textTrigger);
    fireEvent.click(
      within(insertFooter).getByRole("button", { name: "Agent" }),
    );

    const agentNodes = screen.getAllByTestId("spielwiese-agent-node");
    const insertedNode = agentNodes[3]!;

    expect(agentNodes).toHaveLength(4);
    expect(
      screen.getAllByTestId("spielwiese-agent-node-external-insert-row"),
    ).toHaveLength(1);
    expect(
      within(insertedNode).queryByTestId("spielwiese-detached-user-card-deck"),
    ).toBeNull();
    expect(
      (
        within(insertedNode).getByLabelText(
          "coach-agent-2 title",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        within(insertedNode).getByLabelText(
          "coach-agent-2 Instructions",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });

  it("inserts a blank user-only node after the current node when the external user option is chosen and keeps an archive control on that node", () => {
    renderVisionNode();
    const { insertFooter, textTrigger } = getExternalInsertControls();

    fireEvent.click(textTrigger);
    fireEvent.click(within(insertFooter).getByRole("button", { name: "User" }));

    const agentNodes = screen.getAllByTestId("spielwiese-agent-node");
    const insertedNode = agentNodes[3]!;

    expect(agentNodes).toHaveLength(4);
    expect(
      screen.getAllByTestId("spielwiese-agent-node-external-insert-row"),
    ).toHaveLength(1);
    expect(
      within(insertedNode).queryByTestId("spielwiese-agent-node-card"),
    ).toBeNull();
    expect(
      within(insertedNode).getByRole("button", {
        name: "Archive coach-agent-2 node",
      }),
    ).toBeTruthy();
    expect(
      (
        within(insertedNode).getByLabelText(
          "coach-agent-2 User message",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });

  it("archives a node locally and leaves the single insert tray at the end of the remaining stack", () => {
    const visionNode = renderVisionNode();

    fireEvent.click(
      within(visionNode).getAllByRole("button", {
        name: "Archive vision-agent node",
      })[0] as HTMLButtonElement,
    );

    const remainingNodes = screen.getAllByTestId("spielwiese-agent-node");
    const stack = screen.getByTestId("spielwiese-agent-node-stack");
    const insertFooter = screen.getByTestId(
      "spielwiese-agent-node-insert-footer",
    );

    expect(screen.queryByLabelText("vision-agent title")).toBeNull();
    expect(remainingNodes).toHaveLength(2);
    expect(
      screen.getAllByTestId("spielwiese-agent-node-external-insert-row"),
    ).toHaveLength(1);
    expect(
      stack.querySelector("[data-testid='spielwiese-agent-node-insert-slot']"),
    ).toBeNull();
    expect(insertFooter).toBeTruthy();
  });
});
