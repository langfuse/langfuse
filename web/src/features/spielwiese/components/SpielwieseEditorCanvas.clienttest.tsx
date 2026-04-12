/* eslint-disable max-lines */
import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { expectAssistantReplyCard } from "./spielwieseAssistantReplyTestAssertions";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";
import {
  expectAttioSectionChip,
  expectDetachedUserRowChrome,
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

function insertAssistantSection(nodeElement: HTMLElement) {
  fireEvent.click(
    within(nodeElement).getByTestId("spielwiese-message-insert-text-trigger"),
  );
  fireEvent.click(
    within(nodeElement).getByRole("button", { name: "Assistant" }),
  );
}

function getInstructionsSectionElements(nodeCard: HTMLElement) {
  const sectionRows = within(nodeCard).getAllByTestId(
    "spielwiese-message-section-row",
  );
  const instructionsInput = within(nodeCard).getByLabelText(
    "vision-agent Instructions",
  );
  const instructionsTextareaRoot = instructionsInput.parentElement;
  const instructionsPromptShell = within(nodeCard).getByTestId(
    "spielwiese-system-message-prompt-shell",
  );
  const instructionsFieldShell = instructionsPromptShell?.parentElement;
  const instructionsBody = instructionsFieldShell?.parentElement;
  const instructionsToggle = within(nodeCard).getByRole("button", {
    name: "Toggle vision-agent Instructions section",
  });

  return {
    sectionRows,
    instructionsInput,
    instructionsTextareaRoot,
    instructionsPromptShell,
    instructionsFieldShell,
    instructionsBody,
    instructionsToggle,
  };
}

function expectInstructionsSectionChrome(
  nodeCard: HTMLElement,
  {
    sectionRows,
    instructionsInput,
    instructionsTextareaRoot,
    instructionsPromptShell,
    instructionsBody,
    instructionsFieldShell,
    instructionsToggle,
  }: ReturnType<typeof getInstructionsSectionElements>,
) {
  const firstSectionRow = sectionRows[0] as HTMLElement;
  const sectionRowGroup = firstSectionRow.parentElement as HTMLElement;
  const headerShell = within(nodeCard).getByTestId(
    "spielwiese-agent-node-header-shell",
  );
  const instructionsBodyElement = instructionsBody as HTMLElement;
  const instructionsTextareaRootElement =
    instructionsTextareaRoot as HTMLElement;
  const instructionsPromptShellElement = instructionsPromptShell as HTMLElement;
  const instructionsFieldShellElement = instructionsFieldShell as HTMLElement;
  const instructionsHeader = within(instructionsFieldShellElement).getByTestId(
    "spielwiese-message-section-header",
  );

  expectInstructionsSectionPlacement({
    firstSectionRow,
    headerShell,
    instructionsBodyElement,
    instructionsInput,
    instructionsTextareaRootElement,
    sectionRowGroup,
  });
  expectInstructionsPromptChrome({
    instructionsBodyElement,
    instructionsFieldShellElement,
    instructionsHeader,
    instructionsInput,
    instructionsPromptShellElement,
    instructionsToggle,
    nodeCard,
  });
}

function expectInstructionsSectionPlacement({
  firstSectionRow,
  headerShell,
  instructionsBodyElement,
  instructionsInput,
  instructionsTextareaRootElement,
  sectionRowGroup,
}: {
  firstSectionRow: HTMLElement;
  headerShell: HTMLElement;
  instructionsBodyElement: HTMLElement;
  instructionsInput: HTMLElement;
  instructionsTextareaRootElement: HTMLElement;
  sectionRowGroup: HTMLElement;
}) {
  expect(firstSectionRow.getAttribute("data-section-id")).toBe("system");
  expect(headerShell.contains(firstSectionRow)).toBe(true);
  expect(sectionRowGroup.parentElement).toBe(headerShell);
  expect(sectionRowGroup.className).toContain("pt-0");
  expect(sectionRowGroup.className).not.toContain("pt-px");
  expect(sectionRowGroup.className).toContain("pb-0");
  expect(firstSectionRow.className).toContain("pt-0");
  expect(firstSectionRow.className).not.toContain("pt-1");
  expect(firstSectionRow.className).toContain("px-[5px]");
  expect(firstSectionRow.className).toContain("pb-0");
  expect(instructionsBodyElement.className).toContain("pt-0");
  expect(instructionsInput).toBeTruthy();
  expectNodeShellInsetInnerRadius(instructionsTextareaRootElement.className);
}

function expectNodeShellInsetRadius(className: string) {
  expect(className).toContain(
    "[--embedded-prompt-radius:calc(var(--embedded-prompt-outer-radius)-var(--embedded-prompt-padding))]",
  );
  expect(className).toContain("rounded-[var(--embedded-prompt-radius)]");
  expect(className).not.toContain("rounded-[10px]");
}

function expectNodeShellInsetInnerRadius(className: string) {
  expect(className).toContain(
    "rounded-[calc(var(--embedded-prompt-radius)-var(--embedded-prompt-padding))]",
  );
  expect(className).not.toContain("rounded-[8px]");
}

function expectInstructionsPromptChrome({
  instructionsBodyElement,
  instructionsFieldShellElement,
  instructionsHeader,
  instructionsInput,
  instructionsPromptShellElement,
  instructionsToggle,
  nodeCard,
}: {
  instructionsBodyElement: HTMLElement;
  instructionsFieldShellElement: HTMLElement;
  instructionsHeader: HTMLElement;
  instructionsInput: HTMLElement;
  instructionsPromptShellElement: HTMLElement;
  instructionsToggle: HTMLElement;
  nodeCard: HTMLElement;
}) {
  const fieldShellClassName = instructionsFieldShellElement.className;

  expect(fieldShellClassName).toContain("w-full");
  expectNodeShellInsetRadius(fieldShellClassName);
  expect(fieldShellClassName).toContain("border-[rgba(0,0,0,0.05)]");
  expect(fieldShellClassName).toContain("bg-[#F1F2F2]");
  expect(fieldShellClassName).toContain("shadow-none");
  expect(instructionsFieldShellElement.className).not.toContain(
    "shadow-[0_0_0_3px_rgba(0,0,0,0.03)]",
  );
  expect(instructionsFieldShellElement.contains(instructionsHeader)).toBe(true);
  expect(instructionsPromptShellElement.contains(instructionsHeader)).toBe(
    false,
  );
  expect(fieldShellClassName).toContain("px-[2px]");
  expect(fieldShellClassName).toContain("gap-px");
  expect(fieldShellClassName).toContain("pt-0");
  expect(fieldShellClassName).toContain("pb-[2px]");
  expect(instructionsFieldShellElement.firstElementChild).toBe(
    instructionsHeader,
  );
  expectEmbeddedInstructionsHeaderChrome(instructionsHeader);
  expect(instructionsBodyElement.className).toContain("pb-px");
  expect(instructionsPromptShellElement.className).toContain("bg-[#FBFBFB]");
  expectNodeShellInsetInnerRadius(instructionsPromptShellElement.className);
  expect(instructionsPromptShellElement.className).toContain(
    "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
  );
  expect(fieldShellClassName).toContain("flex-col");
  expect(fieldShellClassName).toContain("items-stretch");
  expectTransparentInstructionsInput(instructionsInput);
  expect(instructionsInput.getAttribute("placeholder")).toBe(
    "Add instructions for this step",
  );
  expect(instructionsToggle.textContent).toContain("Instructions");
  expect(instructionsToggle.querySelector("div")?.className).toContain(
    "text-[12px]",
  );
  expect(instructionsToggle.querySelector("[data-prefix='true']")).toBeTruthy();
  expect(instructionsToggle.querySelector("[data-suffix='true']")).toBeTruthy();
  expect(within(nodeCard).getByTestId("vision-agent-system-icon")).toBeTruthy();
  expectAttioSectionChip(instructionsToggle, nodeCard);
}

function expectEmbeddedInstructionsHeaderChrome(
  instructionsHeader: HTMLElement,
) {
  expect(instructionsHeader.className).toContain("bg-transparent");
  expect(instructionsHeader.className).toContain("gap-3");
  expect(instructionsHeader.className).toContain("ml-[2px]");
  expect(instructionsHeader.className).not.toContain("rounded-[7px]");
  expect(instructionsHeader.className).not.toContain("border");
  expect(instructionsHeader.className).not.toContain("bg-[rgba(0,0,0,0.05)]");
  expect(instructionsHeader.className).not.toContain("px-1");
  expect(instructionsHeader.className).not.toContain("py-px");
  expect(instructionsHeader.className).not.toContain(
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_1px_rgba(255,255,255,0.52)]",
  );
}

function expectTransparentInstructionsInput(instructionsInput: HTMLElement) {
  expect(instructionsInput.className).toContain("bg-transparent");
  expect(instructionsInput.className).toContain("px-3");
  expectNodeShellInsetInnerRadius(instructionsInput.className);
  expect(instructionsInput.className).not.toContain(
    "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
  );
}

function getResponseFormatShellElements(responseFormatSectionRow: HTMLElement) {
  const responseFormatSystemBody =
    responseFormatSectionRow.lastElementChild as HTMLElement;
  const responseFormatSystemFieldShell =
    responseFormatSystemBody.firstElementChild as HTMLElement;

  return {
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
  };
}

function getResponseFormatSwitchOptions(responseFormatSwitch: HTMLElement) {
  return {
    responseFormatJsonOption: within(responseFormatSwitch).getByRole("button", {
      name: "Response format JSON",
    }),
    responseFormatNoneOption: within(responseFormatSwitch).getByRole("button", {
      name: "Response format None",
    }),
  };
}

function getResponseFormatControlElements(
  responseFormatRoot: ReturnType<typeof within>,
) {
  const responseFormatComposer = responseFormatRoot.getByTestId(
    "spielwiese-response-format-composer",
  );
  const responseFormatSurface = responseFormatRoot.getByTestId(
    "spielwiese-response-format-surface",
  );
  const responseFormatRow = responseFormatRoot.getByTestId(
    "spielwiese-response-format-row",
  );
  const responseFormatControlsCluster = responseFormatRoot.getByTestId(
    "spielwiese-response-format-controls-cluster",
  );
  const responseFormatSwitch = responseFormatRoot.getByTestId(
    "spielwiese-response-format-switch",
  );
  const responseFormatLeadingAccessory = responseFormatRoot.getByTestId(
    "spielwiese-response-format-leading-accessory",
  );
  const responseFormatInsertRow = responseFormatRoot.getByTestId(
    "spielwiese-response-format-insert-row",
  );
  const responseFormatInsertTextShell = responseFormatRoot.getByTestId(
    "spielwiese-response-format-insert-text-shell",
  );
  const responseFormatInsertTextTrigger = responseFormatRoot.getByTestId(
    "spielwiese-response-format-insert-text-trigger",
  );
  const responseFormatExpandTrigger = responseFormatRoot.getByTestId(
    "spielwiese-response-format-expand-trigger",
  );
  const { responseFormatJsonOption, responseFormatNoneOption } =
    getResponseFormatSwitchOptions(responseFormatSwitch);

  return {
    responseFormatComposer,
    responseFormatControlsCluster,
    responseFormatExpandTrigger,
    responseFormatInsertRow,
    responseFormatInsertTextShell,
    responseFormatInsertTextTrigger,
    responseFormatJsonOption,
    responseFormatLeadingAccessory,
    responseFormatNoneOption,
    responseFormatRow,
    responseFormatSurface,
    responseFormatSwitch,
  };
}

function getResponseFormatElements(nodeCard: HTMLElement) {
  const responseFormatRoot = within(nodeCard);
  const responseFormatSectionRow = responseFormatRoot
    .getAllByTestId("spielwiese-message-section-row")
    .find(
      (row) => row.getAttribute("data-section-id") === "system",
    ) as HTMLElement;
  const responseFormatControlElements =
    getResponseFormatControlElements(responseFormatRoot);
  const { responseFormatSystemBody, responseFormatSystemFieldShell } =
    getResponseFormatShellElements(responseFormatSectionRow);

  return {
    responseFormatSectionRow,
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
    ...responseFormatControlElements,
  };
}

function expectResponseFormatControlsCluster({
  responseFormatControlsCluster,
  responseFormatExpandTrigger,
  responseFormatSwitch,
}: Pick<
  ReturnType<typeof getResponseFormatElements>,
  | "responseFormatControlsCluster"
  | "responseFormatExpandTrigger"
  | "responseFormatSwitch"
>) {
  expect(responseFormatControlsCluster.className).toContain("ml-auto");
  expect(responseFormatControlsCluster.className).toContain("gap-2.5");
  expect(responseFormatControlsCluster.className).not.toContain(
    "rounded-[10px]",
  );
  expect(responseFormatControlsCluster.className).not.toContain("border");
  expect(responseFormatControlsCluster.className).not.toContain(
    "border-[rgba(0,0,0,0.06)]",
  );
  expect(responseFormatControlsCluster.className).not.toContain("pl-2.5");
  expect(responseFormatControlsCluster.className).not.toContain("pr-0");
  expect(responseFormatControlsCluster.className).not.toContain("px-2.5");
  expect(responseFormatControlsCluster.className).not.toContain("py-1");
  expect(responseFormatControlsCluster.contains(responseFormatSwitch)).toBe(
    true,
  );
  expect(
    responseFormatControlsCluster.contains(responseFormatExpandTrigger),
  ).toBe(false);
  expect(responseFormatControlsCluster.textContent).toContain(
    "Response Format",
  );
  expect(responseFormatSwitch.className).not.toContain("ml-auto");
  expect(responseFormatSwitch.className).toContain("gap-1");
  expect(responseFormatSwitch.className).not.toContain("border");
}

function expectResponseFormatInsertTriggerChrome({
  responseFormatInsertTextShell,
  responseFormatInsertTextTrigger,
}: Pick<
  ReturnType<typeof getResponseFormatElements>,
  "responseFormatInsertTextShell" | "responseFormatInsertTextTrigger"
>) {
  expect(responseFormatInsertTextShell.className).toContain("h-6");
  expect(responseFormatInsertTextShell.className).toContain(
    "[--message-insert-inner-radius:7px]",
  );
  expect(responseFormatInsertTextShell.className).toContain(
    "[--message-insert-padding:2px]",
  );
  expect(responseFormatInsertTextShell.className).toContain(
    "rounded-[var(--message-insert-outer-radius)]",
  );
  expect(responseFormatInsertTextShell.className).toContain(
    "border-[rgba(0,0,0,0.06)]",
  );
  expect(responseFormatInsertTextShell.className).toContain(
    "p-[var(--message-insert-padding)]",
  );
  expect(responseFormatInsertTextTrigger.className).toContain("h-full");
  expect(responseFormatInsertTextTrigger.className).toContain("relative");
  expect(responseFormatInsertTextTrigger.className).toContain("z-10");
  expect(responseFormatInsertTextTrigger.className).toContain("bg-background");
  expect(responseFormatInsertTextTrigger.className).not.toContain(
    "bg-transparent",
  );
  expect(responseFormatInsertTextTrigger.className).toContain(
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
  );
  expect(responseFormatInsertTextTrigger.className).toContain(
    "rounded-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))]",
  );
  expect(responseFormatInsertTextTrigger.className).toContain("px-2");
  expect(responseFormatInsertTextTrigger.className).toContain(
    "text-[0.6875rem]",
  );
}

function expectResponseFormatInsertPickerOptionChrome(nodeCard: HTMLElement) {
  const responseFormatInsertPicker = within(nodeCard).getByTestId(
    "spielwiese-response-format-insert-picker-text",
  );
  const responseFormatPickerButtons = [
    "User",
    "Instructions",
    "Assistant",
    "Tool",
  ].map((label) => within(nodeCard).getByRole("button", { name: label }));
  const pickerButtonRow = responseFormatPickerButtons[0]
    ?.parentElement as HTMLElement;

  expect(responseFormatInsertPicker.className).toContain(
    "rounded-r-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))]",
  );
  expect(responseFormatInsertPicker.className).toContain("-ml-[2px]");
  expect(responseFormatInsertPicker.className).toContain("relative");
  expect(responseFormatInsertPicker.className).toContain("z-0");
  expect(responseFormatInsertPicker.className).not.toContain("border-l");
  expect(responseFormatInsertPicker.className).not.toContain(
    "border-[rgba(0,0,0,0.05)]",
  );
  expect(pickerButtonRow.className).toContain("pl-1");
  expect(pickerButtonRow.className).toContain("pr-px");
  expect(pickerButtonRow.className).toContain("py-0.5");
  expect(pickerButtonRow.className).toContain("items-center");
  expect(pickerButtonRow.className).not.toContain("items-stretch");
  expect(pickerButtonRow.className).toContain("gap-px");
  for (const pickerButton of responseFormatPickerButtons) {
    expect(pickerButton.className).toContain(
      "rounded-[calc(var(--message-insert-outer-radius)-var(--message-insert-padding))]",
    );
    expect(pickerButton.className).toContain("h-4");
    expect(pickerButton.className).not.toContain("h-full");
    expect(pickerButton.className).toContain("pl-1.5");
    expect(pickerButton.className).toContain("pr-[5px]");
    expect(pickerButton.className).toContain("text-[0.6875rem]");
  }
}

function expectResponseFormatComposerChrome(
  nodeCard: HTMLElement,
  responseFormatComposer: HTMLElement,
  responseFormatSurface: HTMLElement,
) {
  expect(responseFormatComposer.parentElement).toBe(nodeCard);
  expect(responseFormatComposer.className).not.toContain("bg-[#F1F2F2]");
  expect(responseFormatComposer.className).toContain("overflow-hidden");
  expect(responseFormatComposer.className).toContain(
    "rounded-b-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(responseFormatComposer.className).toContain("-mx-0.5");
  expect(responseFormatComposer.className).toContain("mt-1");
  expect(responseFormatComposer.className).not.toContain("-mb-0.5");
  expect(responseFormatComposer.className).toContain("px-0");
  expect(responseFormatComposer.className).toContain("pb-0.5");
  expect(responseFormatSurface.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(responseFormatSurface.className).not.toContain(
    "border-[rgba(0,0,0,0.05)]",
  );
  expect(responseFormatSurface.className).not.toContain("border");
  expect(responseFormatSurface.className).toContain("bg-[#F1F2F2]");
  expect(responseFormatSurface.className).toContain("px-[2px]");
  expect(responseFormatSurface.className).toContain("pt-[2px]");
  expect(responseFormatSurface.className).toContain("pb-[2px]");
  expect(nodeCard.lastElementChild).toBe(responseFormatComposer);
}

type ResponseFormatBaseChromeElements = Pick<
  ReturnType<typeof getResponseFormatElements>,
  | "responseFormatComposer"
  | "responseFormatControlsCluster"
  | "responseFormatInsertRow"
  | "responseFormatInsertTextTrigger"
  | "responseFormatSectionRow"
  | "responseFormatLeadingAccessory"
  | "responseFormatInsertTextShell"
  | "responseFormatExpandTrigger"
  | "responseFormatSurface"
  | "responseFormatSwitch"
  | "responseFormatSystemBody"
  | "responseFormatSystemFieldShell"
>;

function expectResponseFormatSystemSectionChrome(
  responseFormatSectionRow: HTMLElement,
  responseFormatSystemBody: HTMLElement,
  responseFormatSystemFieldShell: HTMLElement,
) {
  expect(responseFormatSectionRow.getAttribute("data-section-id")).toBe(
    "system",
  );
  expect(responseFormatSectionRow.className).toContain("px-[5px]");
  expect(responseFormatSystemBody.className).toContain("pt-0");
  expect(responseFormatSystemFieldShell.className).toContain("bg-[#F1F2F2]");
}

function expectResponseFormatBaseChrome(
  nodeCard: HTMLElement,
  {
    responseFormatComposer,
    responseFormatControlsCluster,
    responseFormatSectionRow,
    responseFormatLeadingAccessory,
    responseFormatInsertRow,
    responseFormatInsertTextShell,
    responseFormatInsertTextTrigger,
    responseFormatExpandTrigger,
    responseFormatSurface,
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
    responseFormatSwitch,
  }: ResponseFormatBaseChromeElements,
) {
  expectResponseFormatSystemSectionChrome(
    responseFormatSectionRow,
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
  );
  expectResponseFormatComposerChrome(
    nodeCard,
    responseFormatComposer,
    responseFormatSurface,
  );
  expect(responseFormatLeadingAccessory.contains(responseFormatInsertRow)).toBe(
    true,
  );
  expectResponseFormatInsertTriggerChrome({
    responseFormatInsertTextShell,
    responseFormatInsertTextTrigger,
  });
  expectResponseFormatControlsCluster({
    responseFormatControlsCluster,
    responseFormatExpandTrigger,
    responseFormatSwitch,
  });
  expect(responseFormatInsertRow.className).toContain("pl-0");
  expect(responseFormatInsertTextTrigger.textContent).toBe(
    "+ New agent message",
  );
  expect(responseFormatInsertTextTrigger.getAttribute("aria-expanded")).toBe(
    "false",
  );
  expect(responseFormatSwitch.className).toContain("gap-1");
  expect(responseFormatSwitch.className).not.toContain("rounded-[9px]");
  expect(responseFormatSwitch.className).not.toContain("border");
}

function expectResponseFormatNoneState(
  nodeCard: HTMLElement,
  {
    responseFormatComposer,
    responseFormatControlsCluster,
    responseFormatExpandTrigger,
    responseFormatInsertRow,
    responseFormatInsertTextShell,
    responseFormatInsertTextTrigger,
    responseFormatJsonOption,
    responseFormatLeadingAccessory,
    responseFormatNoneOption,
    responseFormatSectionRow,
    responseFormatSurface,
    responseFormatSwitch,
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
  }: ReturnType<typeof getResponseFormatElements>,
) {
  expectResponseFormatBaseChrome(nodeCard, {
    responseFormatComposer,
    responseFormatControlsCluster,
    responseFormatInsertRow,
    responseFormatInsertTextShell,
    responseFormatInsertTextTrigger,
    responseFormatSectionRow,
    responseFormatLeadingAccessory,
    responseFormatSurface,
    responseFormatSwitch,
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
  });
  expect(responseFormatNoneOption.getAttribute("aria-pressed")).toBe("true");
  expect(responseFormatJsonOption.getAttribute("aria-pressed")).toBe("false");
  expect(responseFormatExpandTrigger.getAttribute("aria-expanded")).toBe(
    "false",
  );
  expect(responseFormatExpandTrigger.getAttribute("aria-hidden")).toBe("true");
  expect(responseFormatExpandTrigger.getAttribute("tabindex")).toBe("-1");
  expect(responseFormatExpandTrigger.className).toContain("opacity-0");
  expect(responseFormatExpandTrigger.className).toContain(
    "pointer-events-none",
  );
  expect(
    within(nodeCard).queryByTestId("spielwiese-json-format-panel"),
  ).toBeNull();
}

function expectResponseFormatJsonState(
  nodeCard: HTMLElement,
  {
    responseFormatComposer,
    responseFormatControlsCluster,
    responseFormatExpandTrigger,
    responseFormatInsertRow,
    responseFormatInsertTextShell,
    responseFormatInsertTextTrigger,
    responseFormatJsonOption,
    responseFormatLeadingAccessory,
    responseFormatNoneOption,
    responseFormatSectionRow,
    responseFormatSurface,
    responseFormatSwitch,
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
  }: ReturnType<typeof getResponseFormatElements>,
) {
  expectResponseFormatBaseChrome(nodeCard, {
    responseFormatComposer,
    responseFormatControlsCluster,
    responseFormatInsertRow,
    responseFormatInsertTextShell,
    responseFormatInsertTextTrigger,
    responseFormatSectionRow,
    responseFormatLeadingAccessory,
    responseFormatSurface,
    responseFormatSwitch,
    responseFormatSystemBody,
    responseFormatSystemFieldShell,
  });
  expect(responseFormatNoneOption.getAttribute("aria-pressed")).toBe("false");
  expect(responseFormatJsonOption.getAttribute("aria-pressed")).toBe("true");
  expect(responseFormatExpandTrigger.getAttribute("aria-hidden")).toBe("false");
  expect(responseFormatExpandTrigger.getAttribute("tabindex")).toBe("0");
  expect(responseFormatExpandTrigger?.getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(responseFormatExpandTrigger).toBeTruthy();
  expect(responseFormatExpandTrigger.className).not.toContain("opacity-0");
  expect(
    responseFormatSystemFieldShell.contains(responseFormatJsonOption),
  ).toBe(false);
  expect(responseFormatSectionRow.contains(responseFormatJsonOption)).toBe(
    false,
  );
}

function expectJsonResponseFormatEditor(nodeCard: HTMLElement) {
  expectResponseFormatNoneState(nodeCard, getResponseFormatElements(nodeCard));

  fireEvent.click(
    within(nodeCard).getByRole("button", { name: "Response format JSON" }),
  );

  const jsonFormatPanel = within(nodeCard).getByTestId(
    "spielwiese-json-format-panel",
  );
  const jsonFormatHighlight = within(nodeCard).getByTestId(
    "spielwiese-json-format-highlight",
  );
  const jsonFormatInput = within(nodeCard).getByLabelText(
    "vision-agent Instructions Response Format JSON",
  );

  const responseFormatElements = getResponseFormatElements(nodeCard);

  expectResponseFormatJsonState(nodeCard, responseFormatElements);
  expectJsonResponseFormatChrome({
    jsonFormatHighlight,
    jsonFormatInput,
    jsonFormatPanel,
    responseFormatComposer: responseFormatElements.responseFormatComposer,
  });
  expectJsonResponseFormatValueEditing(jsonFormatHighlight, jsonFormatInput);
}

function expectJsonResponseFormatChrome({
  jsonFormatHighlight,
  jsonFormatInput,
  jsonFormatPanel,
  responseFormatComposer,
}: {
  jsonFormatHighlight: HTMLElement;
  jsonFormatInput: HTMLElement;
  jsonFormatPanel: HTMLElement;
  responseFormatComposer: HTMLElement;
}) {
  expect(responseFormatComposer.className).not.toContain("border-t");
  expect(responseFormatComposer.className).toContain("pt-0");
  expect(responseFormatComposer.className).toContain("pb-0");
  expect(jsonFormatPanel.className).toContain("mt-px");
  expect(jsonFormatPanel.className).toContain("bg-[#FBFBFB]");
  expect(jsonFormatPanel.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap)-2px)]",
  );
  expect(jsonFormatPanel.className).not.toContain("rounded-[8px]");
  expect(jsonFormatPanel.className).not.toContain("rounded-none");
  expect(jsonFormatPanel.className).not.toContain("border-[rgba(0,0,0,0.05)]");
  expect(jsonFormatPanel.className).not.toContain("bg-[linear-gradient");
  expect(jsonFormatPanel.className).toContain(
    "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
  );
  expect(jsonFormatPanel.className).not.toContain("shadow-[inset_0_1px_0");
  expect(jsonFormatPanel.className).not.toContain("mt-0.5");
  expect(jsonFormatHighlight.className).toContain("font-mono");
  expect(jsonFormatHighlight.className).toContain("text-[#202427]");
  expect(jsonFormatInput.className).toContain("font-mono");
  expect(jsonFormatInput.className).toContain("bg-transparent");
  expect(jsonFormatInput.className).toContain("text-transparent");
  expect(jsonFormatInput.className).toContain("caret-[#202427]");
  expect(jsonFormatInput.className).toContain("rounded-none");
}

function expectJsonResponseFormatValueEditing(
  jsonFormatHighlight: HTMLElement,
  jsonFormatInput: HTMLElement,
) {
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

function expectResponseFormatComposer(nodeCard: HTMLElement) {
  const responseFormatInsertTextTrigger = within(nodeCard).getByTestId(
    "spielwiese-response-format-insert-text-trigger",
  );

  fireEvent.click(responseFormatInsertTextTrigger);
  expect(
    within(nodeCard)
      .getByTestId("spielwiese-response-format-insert-picker-text")
      .getAttribute("data-state"),
  ).toBe("open");
  expectResponseFormatInsertPickerOptionChrome(nodeCard);
  fireEvent.click(within(nodeCard).getByRole("button", { name: "Assistant" }));
  expect(
    within(nodeCard).getAllByLabelText(
      "vision-agent How the assistant should reply",
    ),
  ).toHaveLength(1);

  expectJsonResponseFormatEditor(nodeCard);
  fireEvent.click(
    within(nodeCard).getByTestId("spielwiese-response-format-expand-trigger"),
  );

  expect(
    within(nodeCard).queryByTestId("spielwiese-json-format-panel"),
  ).toBeNull();
  expect(
    within(nodeCard)
      .getByTestId("spielwiese-response-format-expand-trigger")
      .getAttribute("aria-expanded"),
  ).toBe("false");

  fireEvent.click(
    within(nodeCard).getByRole("button", { name: "Response format None" }),
  );

  expectResponseFormatNoneState(nodeCard, getResponseFormatElements(nodeCard));
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
      instructionsTextareaRoot,
      instructionsPromptShell,
      instructionsBody,
      instructionsFieldShell,
      instructionsToggle,
    } = getInstructionsSectionElements(nodeCard);

    expectInstructionsSectionChrome(nodeCard, {
      sectionRows,
      instructionsInput,
      instructionsTextareaRoot,
      instructionsPromptShell,
      instructionsBody,
      instructionsFieldShell,
      instructionsToggle,
    });
    expectResponseFormatComposer(nodeCard);
  });
});
describe("SpielwieseEditorCanvas assistant prompt defaults", () => {
  it("does not render the assistant section by default", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );

    expect(
      within(nodeCard).queryByText("How the assistant should reply"),
    ).toBeNull();
    expect(
      within(nodeCard).queryByLabelText(
        "vision-agent How the assistant should reply",
      ),
    ).toBeNull();
  });
});
describe("SpielwieseEditorCanvas assistant prompt layout", () => {
  it("renders the assistant section with the same surface treatment as other prompt rows and a two-row body once inserted", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0];
    const nodeCard = within(visionNode).getByTestId(
      "spielwiese-agent-node-card",
    );

    insertAssistantSection(visionNode);

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
    const responsePromptSections = assistantRow?.parentElement as HTMLElement;

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
    expect(responsePromptSections.className).toContain("gap-0");
    expect(responsePromptSections.className).not.toContain("gap-[7px]");
    expectAssistantReplyRowShell(assistantRow);
    expectAssistantReplyCard(behaviorCard);
  });
});
