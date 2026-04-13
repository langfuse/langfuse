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
  it("opens a large modal editor on click without triggering a hover spotlight", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0]!;
    const headerActions = within(visionNode).getByTestId(
      "spielwiese-agent-node-header-actions",
    );
    const previewButton = within(headerActions).getByRole("button", {
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
      screen.queryByTestId("spielwiese-agent-node-preview-spotlight"),
    ).toBeNull();
    expect(cardDeck.className).not.toContain("scale-105");

    fireEvent.click(previewButton);

    const focusDialog = screen.getByRole("dialog", {
      name: "vision-agent focus mode",
    });
    const modalPreviewButton = within(focusDialog).getByRole("button", {
      name: "Close vision-agent focus mode",
    });

    expect(
      screen.getByTestId("spielwiese-agent-node-focus-modal"),
    ).toBeTruthy();
    expect(
      within(focusDialog).getByLabelText("vision-agent Instructions"),
    ).toBeTruthy();
    expect(modalPreviewButton.getAttribute("aria-pressed")).toBe("true");
    expect(focusDialog.className).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(focusDialog.className).toContain(
      "w-[min(92rem,calc(100vw-1.5rem))]",
    );

    fireEvent.click(modalPreviewButton);

    expect(
      screen.queryByRole("dialog", {
        name: "vision-agent focus mode",
      }),
    ).toBeNull();
  });
});
