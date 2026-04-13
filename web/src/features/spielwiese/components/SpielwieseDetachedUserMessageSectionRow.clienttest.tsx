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

  it("uses the same white shell fill as the standard agent prompt surface", () => {
    renderCanvas();

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const detachedUserFrame = within(visionNode).getByTestId(
      "spielwiese-detached-user-content-frame",
    );
    const detachedUserPromptShell = within(visionNode).getByTestId(
      "spielwiese-detached-user-prompt-shell",
    );
    const detachedUserOuterShell =
      detachedUserFrame.firstElementChild as HTMLElement | null;

    expect(detachedUserFrame.className).toContain("pt-0");
    expect(detachedUserFrame.className).toContain("pb-px");
    expect(detachedUserFrame.className).not.toContain("bg-white");
    expect(detachedUserFrame.className).not.toContain("pt-[6px]");
    expect(detachedUserOuterShell?.className).toContain("pb-[4px]");
    expect(detachedUserOuterShell?.className).toContain("bg-background/96");
    expect(detachedUserOuterShell?.className).toContain("border-border/40");
    expect(detachedUserPromptShell.className).toContain(
      "bg-[var(--spielwiese-agent-node-prompt-value-surface)]",
    );
    expect(detachedUserPromptShell.className).not.toContain("bg-white");
  });
});
