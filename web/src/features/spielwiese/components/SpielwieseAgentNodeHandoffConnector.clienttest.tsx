import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import { getSpielwieseToneStyles } from "./spielwieseToneStyles";
import { SpielwieseVariableValuesProvider } from "./useSpielwieseVariableValues";

const connectorVariableItems = [
  {
    helper: "grilled salmon, asparagus",
    id: "variable-detected-foods",
    label: "detected_foods",
    tone: "blue" as const,
  },
  {
    helper: "379 kcal, 41.9g protein",
    id: "variable-macro-estimates",
    label: "macro_estimates",
    tone: "green" as const,
  },
];

const connectorVariableItemsWithPlatingNotes = [
  ...connectorVariableItems,
  {
    helper: "charred edge, lemon on the side",
    id: "variable-plating-notes",
    label: "plating_notes",
    tone: "yellow" as const,
  },
];

function renderCanvas({
  variableItems = connectorVariableItems,
}: {
  variableItems?: typeof connectorVariableItems;
} = {}) {
  return render(
    <SpielwieseVariableValuesProvider items={variableItems}>
      <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />
    </SpielwieseVariableValuesProvider>,
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

function getConnectorTagByLabel(connector: HTMLElement, label: string) {
  return within(connector)
    .getAllByTestId("spielwiese-agent-node-connector-tag")
    .find((tag) => tag.textContent?.includes(label));
}

function updateNutritionInstructionsToUsePlatingNotes() {
  fireEvent.change(screen.getByLabelText("nutrition-agent Instructions"), {
    target: {
      value:
        'You are a clinical nutritionist.\nUse {{detected_foods}} and {{plating_notes}} to calculate the meal.\nWrite totals to {{macro_estimates}} and micronutrient notes to {{micronutrient_notes}}.\nReturn ONLY JSON:\n{"items":[...],"totals":{...}}',
    },
  });
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
  expect(visionArrow.className).toContain("size-4");
  expect(visionArrow.className).toContain("rounded-[7px]");
  expect(visionArrow.className).toContain(
    "border-[color:var(--spielwiese-agent-node-chrome-border)]",
  );
  expect(visionArrow.className).toContain("bg-white/78");
  expect(visionTagStrip.className).toContain("justify-start");
  expect(visionConnector?.textContent).toContain("detected_foods");
  expect(visionConnector?.textContent).toContain("plating_notes");
  expect(nutritionConnector?.textContent).toContain("macro_estimates");
  expect(nutritionConnector?.textContent).toContain("micronutrient_notes");
  expect(nutritionConnector?.textContent).not.toContain("detected_foods");
  expect(screen.queryByDisplayValue("detected_foods")).toBeNull();
  expect(screen.queryByDisplayValue("macro_estimates")).toBeNull();
}

function expectConnectorTagStates({
  detectedFoodsTag,
  macroEstimatesTag,
  micronutrientNotesTag,
  platingNotesTag,
}: ReturnType<typeof getConnectorElements>) {
  const firstTone = getSpielwieseToneStyles(0);

  expectConnectorValueFlags({
    detectedFoodsTag,
    macroEstimatesTag,
    micronutrientNotesTag,
    platingNotesTag,
  });
  expectConnectorStatusIndicators({
    detectedFoodsTag,
    firstTone,
    macroEstimatesTag,
    micronutrientNotesTag,
    platingNotesTag,
  });
}

function expectConnectorValueFlags({
  detectedFoodsTag,
  macroEstimatesTag,
  micronutrientNotesTag,
  platingNotesTag,
}: ReturnType<typeof getConnectorElements>) {
  expect(detectedFoodsTag?.getAttribute("data-state")).toBe("passed");
  expect(platingNotesTag?.getAttribute("data-state")).toBe("pending");
  expect(macroEstimatesTag?.getAttribute("data-state")).toBe("passed");
  expect(micronutrientNotesTag?.getAttribute("data-state")).toBe("pending");
  expect(detectedFoodsTag?.getAttribute("data-empty")).toBe("false");
  expect(platingNotesTag?.getAttribute("data-empty")).toBe("true");
  expect(macroEstimatesTag?.getAttribute("data-empty")).toBe("false");
  expect(micronutrientNotesTag?.getAttribute("data-empty")).toBe("true");
}

function expectConnectorStatusIndicators({
  detectedFoodsTag,
  firstTone,
  macroEstimatesTag,
  micronutrientNotesTag,
  platingNotesTag,
}: {
  detectedFoodsTag: ReturnType<typeof getConnectorElements>["detectedFoodsTag"];
  firstTone: ReturnType<typeof getSpielwieseToneStyles>;
  macroEstimatesTag: ReturnType<
    typeof getConnectorElements
  >["macroEstimatesTag"];
  micronutrientNotesTag: ReturnType<
    typeof getConnectorElements
  >["micronutrientNotesTag"];
  platingNotesTag: ReturnType<typeof getConnectorElements>["platingNotesTag"];
}) {
  expect(detectedFoodsTag?.style.backgroundColor).toContain("oklch(");
  expect(detectedFoodsTag?.style.color).toContain("oklch(");
  expect(detectedFoodsTag?.style.boxShadow).toContain(firstTone.accent);
  expect(platingNotesTag?.style.backgroundColor).toBe("");
  expect(platingNotesTag?.className).toContain("text-foreground/38");
  expect(
    within(detectedFoodsTag!).getByTestId(
      "spielwiese-agent-node-connector-tag-check",
    ),
  ).toBeTruthy();
  expect(detectedFoodsTag?.lastElementChild?.getAttribute("data-testid")).toBe(
    "spielwiese-agent-node-connector-tag-check",
  );
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
    within(platingNotesTag!).getByTestId(
      "spielwiese-agent-node-connector-tag-empty",
    ).textContent,
  ).toBe("empty");
  expect(platingNotesTag?.lastElementChild?.getAttribute("data-testid")).toBe(
    "spielwiese-agent-node-connector-tag-empty",
  );
  expect(
    within(micronutrientNotesTag!).queryByTestId(
      "spielwiese-agent-node-connector-tag-check",
    ),
  ).toBeNull();
}

describe("SpielwieseAgentNodeHandoffConnector defaults", () => {
  it("renders passed and pending handoff tags between nodes", () => {
    renderCanvas();
    const elements = getConnectorElements();

    expectConnectorLayout(elements);
    expectConnectorTagStates(elements);
  });

  it("updates the connector state when a downstream node starts using a tag", () => {
    renderCanvas({ variableItems: connectorVariableItemsWithPlatingNotes });
    updateNutritionInstructionsToUsePlatingNotes();

    const firstConnector = screen.getAllByTestId(
      "spielwiese-agent-node-connector",
    )[0]!;
    const platingNotesTag = getConnectorTagByLabel(
      firstConnector,
      "plating_notes",
    );

    expect(platingNotesTag?.getAttribute("data-state")).toBe("passed");
    expect(platingNotesTag?.getAttribute("data-empty")).toBe("false");
    expect(
      within(platingNotesTag!).getByTestId(
        "spielwiese-agent-node-connector-tag-check",
      ),
    ).toBeTruthy();
  });
});

describe("SpielwieseAgentNodeHandoffConnector live tag state", () => {
  it("picks up newly written tags anywhere in the source node like the sidebar detection does", () => {
    renderCanvas({ variableItems: [] });

    fireEvent.change(screen.getByLabelText("vision-agent User message"), {
      target: { value: "Attach {{uploaded_file}}" },
    });

    const firstConnector = screen.getAllByTestId(
      "spielwiese-agent-node-connector",
    )[0]!;
    const uploadedFileTag = within(firstConnector)
      .getAllByTestId("spielwiese-agent-node-connector-tag")
      .find((tag) => tag.textContent?.includes("uploaded_file"));

    expect(uploadedFileTag?.getAttribute("data-state")).toBe("pending");
    expect(uploadedFileTag?.getAttribute("data-empty")).toBe("true");
    expect(
      within(uploadedFileTag!).getByTestId(
        "spielwiese-agent-node-connector-tag-empty",
      ).textContent,
    ).toBe("empty");
  });

  it("shows empty instead of a checkmark when a passed tag has no sidebar value", () => {
    renderCanvas({ variableItems: [] });
    updateNutritionInstructionsToUsePlatingNotes();

    const { detectedFoodsTag, macroEstimatesTag, platingNotesTag } =
      getConnectorElements();

    expect(detectedFoodsTag?.getAttribute("data-state")).toBe("passed");
    expect(detectedFoodsTag?.getAttribute("data-empty")).toBe("true");
    expect(
      within(detectedFoodsTag!).queryByTestId(
        "spielwiese-agent-node-connector-tag-check",
      ),
    ).toBeNull();
    expect(
      within(detectedFoodsTag!).getByTestId(
        "spielwiese-agent-node-connector-tag-empty",
      ).textContent,
    ).toBe("empty");

    expect(macroEstimatesTag?.getAttribute("data-state")).toBe("passed");
    expect(macroEstimatesTag?.getAttribute("data-empty")).toBe("true");
    expect(
      within(macroEstimatesTag!).queryByTestId(
        "spielwiese-agent-node-connector-tag-check",
      ),
    ).toBeNull();
    expect(platingNotesTag?.getAttribute("data-state")).toBe("passed");
    expect(platingNotesTag?.getAttribute("data-empty")).toBe("true");
    expect(
      within(platingNotesTag!).queryByTestId(
        "spielwiese-agent-node-connector-tag-check",
      ),
    ).toBeNull();
  });
});
