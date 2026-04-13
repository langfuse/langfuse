import { render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import { getSpielwieseToneStyles } from "./spielwieseToneStyles";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function getConnectorElements() {
  const connectors = screen.getAllByTestId("spielwiese-agent-node-connector");
  const [visionConnector, nutritionConnector] = connectors;
  const visionArrow = within(visionConnector!).getByTestId(
    "spielwiese-agent-node-connector-arrow",
  );
  const visionTagStrip = within(visionConnector!).getByTestId(
    "spielwiese-agent-node-connector-tag-strip",
  );
  const [detectedFoodsTag, platingNotesTag] = within(
    visionConnector!,
  ).getAllByTestId("spielwiese-agent-node-connector-tag");
  const [macroEstimatesTag, micronutrientNotesTag] = within(
    nutritionConnector!,
  ).getAllByTestId("spielwiese-agent-node-connector-tag");

  return {
    connectors,
    detectedFoodsTag,
    macroEstimatesTag,
    micronutrientNotesTag,
    nutritionConnector,
    platingNotesTag,
    visionArrow,
    visionConnector,
    visionTagStrip,
  };
}

function expectConnectorLayout({
  connectors,
  nutritionConnector,
  visionArrow,
  visionConnector,
  visionTagStrip,
}: ReturnType<typeof getConnectorElements>) {
  expect(connectors).toHaveLength(2);
  expect(visionConnector?.className).toContain("grid");
  expect(visionConnector?.className).toContain(
    "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
  );
  expect(visionConnector?.className).toContain("gap-2.5");
  expect(visionArrow.className).toContain("rounded-full");
  expect(visionArrow.className).toContain(
    "border-[color:var(--spielwiese-agent-node-chrome-border)]",
  );
  expect(visionArrow.className).toContain("bg-background");
  expect(visionTagStrip.className).toContain("justify-start");
  expect(visionConnector?.textContent).toContain("detected_foods");
  expect(visionConnector?.textContent).toContain("plating_notes");
  expect(nutritionConnector?.textContent).toContain("macro_estimates");
  expect(nutritionConnector?.textContent).toContain("micronutrient_notes");
}

function expectConnectorTagStates({
  detectedFoodsTag,
  macroEstimatesTag,
  micronutrientNotesTag,
  platingNotesTag,
}: ReturnType<typeof getConnectorElements>) {
  const firstTone = getSpielwieseToneStyles(0);

  expect(detectedFoodsTag?.getAttribute("data-state")).toBe("passed");
  expect(platingNotesTag?.getAttribute("data-state")).toBe("pending");
  expect(macroEstimatesTag?.getAttribute("data-state")).toBe("passed");
  expect(micronutrientNotesTag?.getAttribute("data-state")).toBe("pending");
  expect(detectedFoodsTag?.style.backgroundColor).toContain("oklch(");
  expect(detectedFoodsTag?.style.color).toContain("oklch(");
  expect(detectedFoodsTag?.style.boxShadow).toContain(firstTone.accent);
  expect(platingNotesTag?.style.backgroundColor).toBe("");
  expect(platingNotesTag?.className).toContain("text-foreground/34");
  expect(
    within(detectedFoodsTag!).getByTestId(
      "spielwiese-agent-node-connector-tag-check",
    ),
  ).toBeTruthy();
  expect(
    within(detectedFoodsTag!).getByTestId(
      "spielwiese-agent-node-connector-tag-check",
    ).style.color,
  ).toContain("oklch(");
  expect(
    within(macroEstimatesTag!).getByTestId(
      "spielwiese-agent-node-connector-tag-check",
    ),
  ).toBeTruthy();
  expect(
    within(platingNotesTag!).queryByTestId(
      "spielwiese-agent-node-connector-tag-check",
    ),
  ).toBeNull();
  expect(
    within(micronutrientNotesTag!).queryByTestId(
      "spielwiese-agent-node-connector-tag-check",
    ),
  ).toBeNull();
}

describe("SpielwieseAgentNodeHandoffConnector", () => {
  it("renders passed and pending handoff tags between nodes", () => {
    renderCanvas();
    const elements = getConnectorElements();

    expectConnectorLayout(elements);
    expectConnectorTagStates(elements);
  });
});
