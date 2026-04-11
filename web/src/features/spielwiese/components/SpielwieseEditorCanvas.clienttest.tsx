import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import {
  expectAssistantReplyCard,
  expectAttioSectionChip,
  expectDetachedUserRowChrome,
  expectShadowedMessageFieldShell,
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
  expect(assistantRow?.className).toContain("bg-transparent");
  expect(assistantRow?.className).not.toContain("border");
  expect(assistantRow?.className).not.toContain("border-border/40");
}

function getInstructionsSectionElements(nodeCard: HTMLElement) {
  const sectionRows = within(nodeCard).getAllByTestId(
    "spielwiese-message-section-row",
  );
  const instructionsInput = within(nodeCard).getByLabelText(
    "vision-agent Instructions",
  );
  const instructionsFieldShell = instructionsInput.parentElement;
  const instructionsBody = instructionsFieldShell?.parentElement;
  const instructionsToggle = within(nodeCard).getByRole("button", {
    name: "Toggle vision-agent Instructions section",
  });
  const jsonFormatToggle = within(nodeCard).getByRole("button", {
    name: "JSON Format",
  });

  return {
    sectionRows,
    instructionsInput,
    instructionsFieldShell,
    instructionsBody,
    instructionsToggle,
    jsonFormatToggle,
  };
}

function expectInstructionsJsonFormatComposer(nodeCard: HTMLElement) {
  const jsonFormatToggle = within(nodeCard).getByRole("button", {
    name: "JSON Format",
  });

  expect(jsonFormatToggle.getAttribute("aria-expanded")).toBe("false");

  fireEvent.click(jsonFormatToggle);

  const jsonFormatPanel = within(nodeCard).getByTestId(
    "spielwiese-json-format-panel",
  );
  const jsonFormatHighlight = within(nodeCard).getByTestId(
    "spielwiese-json-format-highlight",
  );
  const jsonFormatInput = within(nodeCard).getByLabelText(
    "vision-agent Instructions JSON Format",
  );

  expect(jsonFormatToggle.getAttribute("aria-expanded")).toBe("true");
  expect(jsonFormatPanel.className).toContain("bg-[#F6F7F7]");
  expect(jsonFormatPanel.className).toContain("border-[rgba(0,0,0,0.05)]");
  expect(jsonFormatPanel.className).not.toContain("bg-[linear-gradient");
  expect(jsonFormatPanel.className).not.toContain("shadow-[inset_0_1px_0");
  expect(jsonFormatHighlight.className).toContain("font-mono");
  expect(jsonFormatHighlight.className).toContain("text-[#202427]");
  expect(jsonFormatInput.className).toContain("font-mono");
  expect(jsonFormatInput.className).toContain("bg-transparent");
  expect(jsonFormatInput.className).toContain("text-transparent");
  expect(jsonFormatInput.className).toContain("caret-[#202427]");

  fireEvent.change(jsonFormatInput, {
    target: { value: '{\n  "food": "string"\n}' },
  });

  expect((jsonFormatInput as HTMLTextAreaElement).value).toBe(
    '{\n  "food": "string"\n}',
  );
  expect(
    within(jsonFormatHighlight)
      .getByText('"food"')
      .getAttribute("data-token-kind"),
  ).toBe("key");
  expect(
    within(jsonFormatHighlight)
      .getByText('"string"')
      .getAttribute("data-token-kind"),
  ).toBe("string");
}

describe("SpielwieseEditorCanvas detached user layout", () => {
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
});

describe("SpielwieseEditorCanvas instructions prompt layout", () => {
  it("renders the instructions section first inside the node card with a flat row and gear icon", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const {
      sectionRows,
      instructionsInput,
      instructionsBody,
      instructionsFieldShell,
      instructionsToggle,
    } = getInstructionsSectionElements(nodeCard);

    expect(sectionRows[0]?.getAttribute("data-section-id")).toBe("system");
    expect(sectionRows[0]?.parentElement?.className).toContain("pt-1");
    expect(sectionRows[0]?.parentElement?.className).toContain("pb-1");
    expect(instructionsBody?.className).toContain("pt-3.5");
    expect(instructionsInput).toBeTruthy();
    expectShadowedMessageFieldShell(instructionsFieldShell);
    expect(instructionsFieldShell?.className).toContain("flex-col");
    expect(instructionsFieldShell?.className).toContain("items-stretch");
    expect(instructionsInput.className).toContain("bg-transparent");
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
    expectInstructionsJsonFormatComposer(nodeCard);
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
    const assistantToggle = within(assistantRow ?? nodeCard).getByRole(
      "button",
      {
        name: "Toggle vision-agent How the assistant should reply section",
      },
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
    expect(assistantToggle.querySelector("[data-prefix='true']")).toBeTruthy();
    expect(
      within(nodeCard).getByTestId("vision-agent-assistant-icon"),
    ).toBeTruthy();
    expectAssistantReplyRowShell(assistantRow);
    expectAssistantReplyCard(behaviorCard);
  });
});
