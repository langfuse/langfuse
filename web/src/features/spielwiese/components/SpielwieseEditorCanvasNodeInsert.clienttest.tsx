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

function getEmptyStateInsertControls() {
  const emptyState = screen.getByTestId("spielwiese-agent-node-empty-state");

  return {
    emptyState,
    externalRow: within(emptyState).getByTestId(
      "spielwiese-agent-node-external-insert-row",
    ),
    textPicker: within(emptyState).getByTestId(
      "spielwiese-agent-node-insert-picker",
    ),
    textShell: within(emptyState).getByTestId(
      "spielwiese-agent-node-insert-shell",
    ),
    textTrigger: within(emptyState).getByTestId(
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
  expect(externalRow.className).toContain("opacity-100");
  expect(externalRow.className).toContain("pointer-events-auto");
  expect(externalRow.className).not.toContain("mt-[8px]");
  expect(externalRow.className).not.toContain("pl-[18px]");
  expect(externalRow.className).not.toContain("ml-[8px]");
  expect(externalRow.className).not.toContain("ml-[18px]");
  expect(externalRow.className).not.toContain("opacity-0");
  expect(externalRow.className).not.toContain("pointer-events-none");
  expect(externalRow.className).not.toContain("group-hover/agent-node");
  expect(externalRow.className).not.toContain("group-focus-within/agent-node");
  expect(insertFooter.className).toContain("flex-none");
  expect(insertFooter.className).toContain("-mx-2");
  expect(insertFooter.className).toContain("w-[calc(100%+1rem)]");
  expect(insertFooter.className).toContain("justify-start");
  expect(insertFooter.className).toContain(
    "rounded-b-[var(--canvas-pane-inner-radius)]",
  );
  expect(insertFooter.className).toContain(
    "-mb-[calc(var(--canvas-pane-shell-gap)+6px)]",
  );
  expect(insertFooter.className).toContain("px-2");
  expect(insertFooter.className).toContain("py-2");
  expect(insertFooter.className).not.toContain("pb-2");
  expect(insertFooter.className).not.toContain("border-t");
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

function expectArchiveButtonIsInert(button: HTMLElement) {
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.getAttribute("tabindex")).toBe("-1");
  expect(button.className).toContain("pointer-events-none");
  expect(button.className).toContain("cursor-default");
}

function renderVisionNode() {
  render(<SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />);
  return screen.getAllByTestId("spielwiese-agent-node")[0];
}

function renderEmptyCanvas() {
  return render(
    <SpielwieseEditorCanvas
      canvas={{
        ...spielwieseEditorCanvasTestCanvas,
        agentNodes: [],
        stats: [{ id: "blocks", label: "Blocks", value: "00" }],
      }}
    />,
  );
}

// eslint-disable-next-line max-lines-per-function
describe("SpielwieseEditorCanvas node insertion", () => {
  it("keeps the external new node tray available when the canvas starts empty and lets the first node be inserted", () => {
    renderEmptyCanvas();

    expect(screen.queryAllByTestId("spielwiese-agent-node")).toHaveLength(0);
    expect(screen.getByText("Get started building your agents")).toBeTruthy();
    expect(
      screen.getAllByTestId("spielwiese-agent-node-external-insert-row"),
    ).toHaveLength(2);

    const centeredControls = getEmptyStateInsertControls();
    const { insertFooter } = getExternalInsertControls();
    const { externalRow, textPicker, textShell, textTrigger } =
      centeredControls;

    expect(insertFooter).toBeTruthy();
    expect(externalRow.className).not.toContain("mt-[8px]");
    expect(textShell.className).toContain("overflow-hidden");
    expect(textTrigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(textTrigger);

    expect(textPicker.getAttribute("data-state")).toBe("open");

    fireEvent.click(
      within(centeredControls.emptyState).getByRole("button", {
        name: "Agent",
      }),
    );

    const agentNodes = screen.getAllByTestId("spielwiese-agent-node");
    const insertedNode = agentNodes[0]!;

    expect(agentNodes).toHaveLength(1);
    expect(
      screen.queryByTestId("spielwiese-agent-node-empty-state"),
    ).toBeNull();
    expect(
      screen.getAllByTestId("spielwiese-agent-node-external-insert-row"),
    ).toHaveLength(1);
    expect(
      (
        within(insertedNode).getByLabelText(
          "agent-node title",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        within(insertedNode).getByLabelText(
          "agent-node Instructions",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });

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
    const archiveButton = within(insertedNode).getByRole("button", {
      name: "Archive coach-agent-2 node",
    });

    expectArchiveButtonIsInert(archiveButton);
    expect(
      (
        within(insertedNode).getByLabelText(
          "coach-agent-2 User message",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });

  it("keeps archive controls inert without removing nodes", () => {
    const visionNode = renderVisionNode();
    const archiveButton = within(visionNode).getAllByRole("button", {
      name: "Archive vision-agent node",
    })[0] as HTMLButtonElement;

    fireEvent.click(archiveButton);

    const stack = screen.getByTestId("spielwiese-agent-node-stack");
    const insertFooter = screen.getByTestId(
      "spielwiese-agent-node-insert-footer",
    );

    expectArchiveButtonIsInert(archiveButton);
    expect(screen.getByLabelText("vision-agent title")).toBeTruthy();
    expect(screen.getAllByTestId("spielwiese-agent-node")).toHaveLength(3);
    expect(
      screen.getAllByTestId("spielwiese-agent-node-external-insert-row"),
    ).toHaveLength(1);
    expect(
      stack.querySelector("[data-testid='spielwiese-agent-node-insert-slot']"),
    ).toBeNull();
    expect(insertFooter).toBeTruthy();
  });
});
