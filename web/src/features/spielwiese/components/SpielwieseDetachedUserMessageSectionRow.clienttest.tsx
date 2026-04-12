import { render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

describe("SpielwieseDetachedUserMessageSectionRow embedded header", () => {
  it("uses the same left inset pattern as the embedded agent instructions header", () => {
    renderCanvas();

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );
    const instructionsHeader = within(nodeCard).getByTestId(
      "spielwiese-message-section-header",
    );
    const detachedUserEmbeddedHeader = within(visionNode).getByTestId(
      "spielwiese-detached-user-embedded-header",
    );

    expect(instructionsHeader.className).toContain("ml-[2px]");
    expect(detachedUserEmbeddedHeader.className).toContain("ml-[2px]");
    expect(detachedUserEmbeddedHeader.firstElementChild?.className).toContain(
      "ml-[3px]",
    );
    expect(detachedUserEmbeddedHeader.textContent).toContain("User message");
  });
});
