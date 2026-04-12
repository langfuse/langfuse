/* eslint-disable max-lines */
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

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function expectVisibleMustacheTag(variableName: string, rawValue: string) {
  const mustacheTag = screen.getByTestId(
    `spielwiese-mustache-tag-${variableName}`,
  );
  const mustacheTagMeasure = screen.getByTestId(
    `spielwiese-mustache-tag-${variableName}-measure`,
  );
  const mustacheTagSurfaceShell = screen.getByTestId(
    `spielwiese-mustache-tag-${variableName}-surface-shell`,
  );
  const mustacheTagSurface = screen.getByTestId(
    `spielwiese-mustache-tag-${variableName}-surface`,
  );
  const mustacheTagLabel = mustacheTagSurface.firstElementChild as HTMLElement;

  expect(mustacheTag).toBeTruthy();
  expect(mustacheTag.className).toContain("relative");
  expect(mustacheTag.className).toContain("align-middle");
  expect(mustacheTag.className).toContain("items-center");
  expect(mustacheTagMeasure.textContent).toBe(rawValue);
  expect(mustacheTagMeasure.className).toContain("invisible");
  expect(mustacheTagMeasure.className).toContain("whitespace-pre");
  expect(mustacheTagSurfaceShell.className).toContain("absolute");
  expect(mustacheTagSurfaceShell.className).toContain("inset-0");
  expect(mustacheTagSurfaceShell.className).toContain("items-center");
  expect(mustacheTagSurfaceShell.className).toContain("justify-center");
  expect(mustacheTagSurface.className).not.toContain("absolute");
  expect(mustacheTagSurface.className).toContain("min-h-[0.9375rem]");
  expect(mustacheTagSurface.className).toContain("rounded-[4px]");
  expect(mustacheTagSurface.className).toContain("px-[3px]");
  expect(mustacheTagLabel.className).toContain("text-[12px]");
  expect(mustacheTagLabel.className).toContain("leading-4");
  expect(mustacheTagLabel.className).toContain("font-medium");
  expect(mustacheTagLabel.textContent).toBe(rawValue);
}

function findPromptRowBySectionId(nodeElement: HTMLElement, sectionId: string) {
  return within(nodeElement)
    .getAllByTestId("spielwiese-message-section-row")
    .find((row) => row.getAttribute("data-section-id") === sectionId);
}

function openAnthropicHaikuPreview(panel: HTMLElement) {
  fireEvent.click(
    within(panel).getByRole("button", {
      name: /^Anthropic\b/,
    }),
  );

  const modelOption = within(panel).getByRole("button", {
    name: "Claude Haiku 4.5",
  });
  const preview = within(panel).getByTestId(
    "spielwiese-model-picker-benchmark-preview",
  );

  expect(preview.textContent).toContain("Hover a model to inspect benchmarks.");

  fireEvent.mouseEnter(modelOption);

  expect(within(panel).getByText("Intelligence")).toBeTruthy();
  expect(
    within(panel).getByText(
      "Leanest Claude option when you still want Claude tone.",
    ),
  ).toBeTruthy();

  return modelOption;
}

function getBenchmarkPreview(panel: HTMLElement) {
  return within(panel).getByTestId("spielwiese-model-picker-benchmark-preview");
}

describe("SpielwieseEditorCanvas editing shell", () => {
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

    const panel = screen.getByRole("dialog", { name: "Model picker" });
    fireEvent.click(openAnthropicHaikuPreview(panel));
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

describe("SpielwieseEditorCanvas editing tags", () => {
  it("renders mustache variables as inline tags inside prompt fields", () => {
    renderCanvas();
    const systemInput = screen.getByLabelText("vision-agent Instructions");

    fireEvent.focus(systemInput);
    fireEvent.change(systemInput, {
      target: { value: "Return {{food_name}} as JSON." },
    });

    expect((systemInput as HTMLTextAreaElement).value).toBe(
      "Return {{food_name}} as JSON.",
    );
    expect(systemInput.className).not.toContain("text-transparent");
    expect(
      screen.queryByTestId("spielwiese-mustache-tag-food_name"),
    ).toBeNull();

    fireEvent.blur(systemInput);

    expectVisibleMustacheTag("food_name", "{{food_name}}");
  });

  it("renders detached user variables as chips immediately after a mustache token closes", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const detachedUserSections = within(visionNode).getByTestId(
      "vision-agent-detached-user-sections",
    );
    const detachedUserInput = within(detachedUserSections).getByLabelText(
      "vision-agent User message",
    );

    fireEvent.focus(detachedUserInput);
    fireEvent.change(detachedUserInput, {
      target: { value: "Attach {{uploaded_file}}" },
    });

    expect((detachedUserInput as HTMLTextAreaElement).value).toBe(
      "Attach {{uploaded_file}}",
    );
    expect(
      within(detachedUserSections).getByTestId(
        "spielwiese-mustache-tag-uploaded_file",
      ),
    ).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas model picker", () => {
  it("renders provider-first browsing with benchmark hover and an older-model toggle", () => {
    renderCanvas();
    const modelButton = screen.getByRole("button", {
      name: "vision-agent Model",
    });
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0]!;
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );

    fireEvent.click(modelButton);

    expect(nodeCard.className).toContain("overflow-visible");
    expect(nodeCard.className).not.toContain("overflow-hidden");
    expect(modelButton.closest(".z-40")).toBeTruthy();
    const panel = screen.getByRole("dialog", { name: "Model picker" });

    expect(
      within(panel).getByRole("button", { name: /^OpenAI\b/ }),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("button", { name: "Recommend model" }),
    ).toBeTruthy();
    expect(within(panel).queryByText("Models")).toBeNull();
    expect(within(panel).queryByRole("button", { name: "GPT-5.4" })).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "OpenAI" }));

    const preview = getBenchmarkPreview(panel);
    const gpt54Button = within(panel).getByRole("button", {
      name: "GPT-5.4",
    });

    expect(
      within(panel).queryByRole("button", { name: "GPT-4.1 mini" }),
    ).toBeNull();
    expect(preview.textContent).toContain(
      "Hover a model to inspect benchmarks.",
    );

    fireEvent.mouseEnter(gpt54Button);

    const hoveredPreview = getBenchmarkPreview(panel);

    expect(hoveredPreview.textContent).toContain("GPT-5.4");
    expect(within(panel).getByText("Intelligence")).toBeTruthy();

    fireEvent.click(
      within(panel).getByTestId("spielwiese-model-picker-older-toggle"),
    );

    expect(
      within(panel).getByRole("button", { name: "GPT-4.1 mini" }),
    ).toBeTruthy();
  });
});

describe("SpielwieseEditorCanvas node collapse sections", () => {
  it("lets each node minimize its prompt sections into single-row previews", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const instructionsRow = findPromptRowBySectionId(visionNode, "system");
    const toggleButton = screen.getByRole("button", {
      name: "Minimize vision-agent node sections",
    });

    fireEvent.click(toggleButton);

    expect(
      within(visionNode).getByLabelText("vision-agent User message"),
    ).toBeTruthy();
    expect(instructionsRow).toBeTruthy();
    expect(
      within(instructionsRow ?? visionNode).getByLabelText(
        "Toggle vision-agent Instructions section",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("vision-agent Instructions")).toBeNull();
    expect(
      screen.queryByLabelText("vision-agent How the assistant should reply"),
    ).toBeNull();
    expect(
      within(visionNode).queryByTestId(
        "spielwiese-message-insert-compact-trigger",
      ),
    ).toBeNull();
    expect(toggleButton.getAttribute("aria-pressed")).toBe("true");
    expect(toggleButton.getAttribute("aria-label")).toBe(
      "Maximize vision-agent node sections",
    );
  });
});

describe("SpielwieseEditorCanvas node collapse detached user", () => {
  it("keeps the detached user input shell inside the rounded row shell", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const detachedUserSections = within(visionNode).getByTestId(
      "vision-agent-detached-user-sections",
    );
    const detachedUserRow = within(detachedUserSections).getByTestId(
      "spielwiese-message-section-row",
    );
    const detachedUserInputShell = within(detachedUserSections).getByTestId(
      "spielwiese-detached-user-input-shell",
    );

    expect(detachedUserRow.contains(detachedUserInputShell)).toBe(true);
  });

  it("lets the detached user row minimize into a single-row preview", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const detachedUserSections = within(visionNode).getByTestId(
      "vision-agent-detached-user-sections",
    );
    const detachedUserRow = within(detachedUserSections).getByTestId(
      "spielwiese-message-section-row",
    );
    const detachedUserToggle = within(detachedUserRow).getByRole("button", {
      name: "Minimize vision-agent User message section",
    });

    fireEvent.click(detachedUserToggle);

    expect(
      within(detachedUserSections).queryByLabelText(
        "vision-agent User message",
      ),
    ).toBeNull();
    expect(
      within(detachedUserRow).getByLabelText(
        "Toggle vision-agent User message section",
      ),
    ).toBeTruthy();
    const collapsedCompactButton = within(detachedUserRow).getByRole("button", {
      name: "Maximize vision-agent User message section",
    });

    expect(detachedUserRow.className).toContain("pb-[5px]");
    expect(collapsedCompactButton.getAttribute("aria-pressed")).toBe("true");
    expect(collapsedCompactButton.getAttribute("aria-label")).toBe(
      "Maximize vision-agent User message section",
    );
  });
});

describe("SpielwieseEditorCanvas section collapse interactions", () => {
  it("lets each prompt section collapse into a single header row preview", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    expect(
      within(visionNode).getAllByText(
        /You are a food identification expert\. Identify every food item in the image\./i,
      ),
    ).toHaveLength(1);

    const collapseButton = within(visionNode).getByLabelText(
      "Toggle vision-agent Instructions section",
    );

    fireEvent.click(collapseButton);

    const collapsedButton = within(visionNode).getByLabelText(
      "Toggle vision-agent Instructions section",
    );

    expect(
      within(visionNode).queryByLabelText("vision-agent Instructions"),
    ).toBeNull();
    expect(collapsedButton.getAttribute("aria-expanded")).toBe("false");
    expect(
      within(visionNode).getAllByText(
        /You are a food identification expert\. Identify every food item in the image\./i,
      ),
    ).toHaveLength(1);
  });
});
