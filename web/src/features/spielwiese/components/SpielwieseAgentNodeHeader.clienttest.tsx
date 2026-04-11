import { render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

describe("SpielwieseAgentNodeHeader strip items", () => {
  it("merges the model picker into the title shell and keeps the reveal labels on the non-model strips", () => {
    render(
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
    );

    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const titleInput = within(visionNode).getByLabelText("vision-agent title");
    const titleControl = within(visionNode).getByTestId(
      "spielwiese-agent-title-control",
    );
    const temperatureInput = within(visionNode).getByLabelText(
      "vision-agent Temperature",
    );
    const modelButton = within(visionNode).getByRole("button", {
      name: "vision-agent Model",
    });
    const collapseButton = within(visionNode).getByLabelText(
      "Toggle vision-agent node",
    );
    const toolButton = within(visionNode).getByRole("button", {
      name: "Create tool",
    });
    const modelRail = modelButton.firstElementChild?.firstElementChild;
    const temperatureTag = temperatureInput.parentElement?.firstElementChild;
    const toolTag = toolButton.firstElementChild;

    expect(modelRail).toBeTruthy();
    expect(temperatureTag).toBeTruthy();
    expect(toolTag).toBeTruthy();
    expect((titleInput as HTMLInputElement).value).toBe("Vision Agent");
    expect(titleControl.className).toContain("bg-[linear-gradient");
    expect(titleControl.contains(modelButton)).toBe(true);
    expect(collapseButton.previousElementSibling).toBe(
      toolButton.parentElement,
    );
    expect(temperatureTag?.className).toContain("hover:w-[6.5rem]");
    expect(toolTag?.className).toContain("hover:w-[4rem]");
    expect(modelRail?.className).toContain("group/setting-tag");
    expect(modelRail?.className).toContain("w-6");
    expect(modelRail?.className).not.toContain("rounded-full");
    expect(modelButton.textContent).toContain("GPT-4.1 mini");
    expect(temperatureTag?.textContent).toContain("Temperature");
    expect(toolTag?.textContent).toContain("Tools");
    expect(modelButton.className).not.toContain("hover:w-[6.5rem]");
  });
});
