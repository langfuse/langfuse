import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

describe("SpielwieseAgentNode focus mode", () => {
  it("spotlights the node on preview hover and opens a centered modal editor on click", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0]!;
    const previewButton = within(visionNode).getByRole("button", {
      name: "Preview vision-agent node",
    });
    const cardDeck = within(visionNode).getByTestId(
      "spielwiese-agent-node-card-deck",
    );

    expect(
      screen.queryByTestId("spielwiese-agent-node-preview-spotlight"),
    ).toBeNull();
    expect(cardDeck.className).not.toContain("scale-105");

    fireEvent.mouseEnter(previewButton);

    expect(
      screen.getByTestId("spielwiese-agent-node-preview-spotlight"),
    ).toBeTruthy();
    expect(cardDeck.className).toContain("scale-105");

    fireEvent.mouseLeave(previewButton);

    expect(
      screen.queryByTestId("spielwiese-agent-node-preview-spotlight"),
    ).toBeNull();
    expect(cardDeck.className).not.toContain("scale-105");

    fireEvent.click(previewButton);

    const focusDialog = screen.getByRole("dialog", {
      name: "vision-agent focus mode",
    });
    const modalPreviewButton = within(focusDialog).getByRole("button", {
      name: "Preview vision-agent node",
    });

    expect(
      screen.getByTestId("spielwiese-agent-node-focus-modal"),
    ).toBeTruthy();
    expect(
      within(focusDialog).getByLabelText("vision-agent Instructions"),
    ).toBeTruthy();
    expect(cardDeck.getAttribute("aria-hidden")).toBe("true");
    expect(modalPreviewButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(modalPreviewButton);

    expect(
      screen.queryByRole("dialog", {
        name: "vision-agent focus mode",
      }),
    ).toBeNull();
    expect(cardDeck.getAttribute("aria-hidden")).toBe("false");
  });
});
