import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import { expectInlineEditingShell } from "./spielwieseEditorCanvasTestAssertions";

function hoverOption(element: HTMLElement) {
  fireEvent.pointerEnter(element);
  fireEvent.pointerMove(element);
}

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

describe("SpielwieseEditorCanvas editing", () => {
  it("keeps inline fields editable with fixed widths", async () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0]!;
    const titleInput = screen.getByLabelText("vision-agent title");
    const titleControl = within(visionNode).getByTestId(
      "spielwiese-agent-title-control",
    );
    const modelInput = screen.getByRole("button", {
      name: "vision-agent Model",
    });
    const systemInput = screen.getByLabelText("vision-agent Instructions");
    const toolCreatorButton = within(visionNode).getByRole("button", {
      name: "Create tool",
    });

    fireEvent.change(titleInput, { target: { value: "Vision Agent Draft" } });
    fireEvent.click(modelInput);

    expect(
      screen.queryByRole("button", { name: "Claude Haiku 4.5" }),
    ).toBeNull();
    expect(screen.queryByText("Token cost")).toBeNull();

    const providerOption = screen.getByRole("button", { name: "Anthropic" });
    hoverOption(providerOption);
    expect(
      screen.getByRole("button", { name: "Claude Opus 4.6" }),
    ).toBeTruthy();
    expect(screen.queryByText("Token cost")).toBeNull();

    const modelOption = screen.getByRole("button", {
      name: "Claude Haiku 4.5",
    });
    hoverOption(modelOption);
    expect(screen.getByText("Token cost")).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
    fireEvent.click(modelOption);
    fireEvent.change(systemInput, {
      target: { value: "Updated system prompt\nwith two fixed lines." },
    });

    expect(screen.getByDisplayValue("Vision Agent Draft")).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "vision-agent Model",
        }).textContent,
      ).toContain("Claude Haiku 4.5");
    });
    expect((systemInput as HTMLTextAreaElement).value).toBe(
      "Updated system prompt\nwith two fixed lines.",
    );
    expectInlineEditingShell({
      modelInput,
      systemInput,
      titleInput,
      titleControl,
      toolCreatorButton,
    });
  });
});

describe("SpielwieseEditorCanvas model picker", () => {
  it("reveals older models behind the more-models control", () => {
    renderCanvas();
    fireEvent.click(
      screen.getByRole("button", {
        name: "vision-agent Model",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    expect(screen.queryByRole("button", { name: "GPT-4.1 mini" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More models" }));

    expect(screen.getByRole("button", { name: "GPT-4.1 mini" })).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas collapse interactions", () => {
  it("lets each node collapse to the header row", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const toggleButton = screen.getByLabelText("Toggle vision-agent node");

    fireEvent.click(toggleButton);

    expect(within(visionNode).getByLabelText("vision-agent User")).toBeTruthy();
    expect(screen.queryByLabelText("vision-agent Instructions")).toBeNull();
    expect(
      screen.queryByLabelText("vision-agent How the assistant should reply"),
    ).toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("lets each prompt section collapse into a single header row preview", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];

    expect(
      within(visionNode).getAllByText(
        /You are a food identification expert\. Identify every food item in the image\./i,
      ),
    ).toHaveLength(1);

    const toggleButton = within(visionNode).getByLabelText(
      "Toggle vision-agent Instructions section",
    );

    fireEvent.click(toggleButton);

    expect(
      within(visionNode).queryByLabelText("vision-agent Instructions"),
    ).toBeNull();
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
    expect(
      within(visionNode).getAllByText(
        /You are a food identification expert\. Identify every food item in the image\./i,
      ),
    ).toHaveLength(1);
  });
});
