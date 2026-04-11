import { render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import {
  expectAssistantReplyCard,
  expectAttioSectionChip,
  expectDetachedUserRowChrome,
} from "./spielwieseEditorCanvasTestAssertions";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function expectAssistantReplyRowShell(assistantRow: HTMLElement | undefined) {
  expect(assistantRow?.className).toContain("rounded-xl");
  expect(assistantRow?.className).toContain("mx-2.5");
  expect(assistantRow?.className).toContain("px-2.5");
  expect(assistantRow?.className).toContain("py-2");
  expect(assistantRow?.className).toContain("border");
  expect(assistantRow?.className).toContain("border-border/40");
  expect(assistantRow?.className).toContain("bg-transparent");
}

describe("SpielwieseEditorCanvas prompt layout", () => {
  it("renders the user message detached above the node card", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const detachedUserSections = within(visionNode).getByTestId(
      "vision-agent-detached-user-sections",
    );
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const detachedUserRow = within(detachedUserSections).getByTestId(
      "spielwiese-message-section-row",
    );

    expectDetachedUserRowChrome(detachedUserSections, detachedUserRow);
    expect(within(nodeCard).queryByLabelText("vision-agent User")).toBeNull();
  });

  it("renders the instructions section first inside the node card with a flat row and gear icon", () => {
    renderCanvas();
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
    const instructionsToggle = within(nodeCard).getByRole("button", {
      name: "Toggle vision-agent Instructions section",
    });

    expect(sectionRows[0]?.getAttribute("data-section-id")).toBe("system");
    expect(sectionRows[0]?.parentElement?.className).toContain("pt-2.5");
    expect(instructionsInput).toBeTruthy();
    expect(instructionsInput.className).toContain("bg-[#dfe0e0]");
    expect(instructionsInput.getAttribute("placeholder")).toBe(
      "Add instructions for this step",
    );
    expect(instructionsToggle.textContent).toContain("Instructions");
    expect(
      instructionsToggle.querySelector("[data-prefix='true']"),
    ).toBeTruthy();
    expect(
      instructionsToggle.querySelector("[data-suffix='true']"),
    ).toBeTruthy();
    expect(
      within(nodeCard).getByTestId("vision-agent-system-icon"),
    ).toBeTruthy();
    expectAttioSectionChip(instructionsToggle, nodeCard);
  });
});
describe("SpielwieseEditorCanvas assistant prompt layout", () => {
  it("renders the assistant section with the same surface treatment as other prompt rows and a two-row body", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const sectionRows = within(nodeCard).getAllByTestId(
      "spielwiese-message-section-row",
    );
    const assistantRow = sectionRows.find(
      (row) => row.getAttribute("data-section-id") === "assistant",
    );
    const behaviorCard = within(assistantRow ?? nodeCard).getByTestId(
      "spielwiese-assistant-reply-card",
    );

    expect(assistantRow).toBeTruthy();
    expect(
      within(assistantRow ?? nodeCard).getByText(
        "How the assistant should reply",
      ),
    ).toBeTruthy();
    expect(
      within(nodeCard).queryByText(
        "When it receives this \u2192 it should respond like this",
      ),
    ).toBeNull();
    expectAssistantReplyRowShell(assistantRow);
    expectAssistantReplyCard(behaviorCard);
  });
});
