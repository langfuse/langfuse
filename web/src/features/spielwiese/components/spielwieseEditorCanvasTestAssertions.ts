/* eslint-disable max-lines */
import { screen, within } from "@testing-library/react";
const assistantReplyCardShadowClassName = "shadow-[0_0_0_3px_rgba(0,0,0,0.03)]";
export function expectInlineEditingShell({
  modelInput,
  systemInput,
  titleInput,
  titleControl,
  toolCreatorButton,
}: {
  modelInput: HTMLElement;
  systemInput: HTMLElement;
  titleInput: HTMLElement;
  titleControl: HTMLElement;
  toolCreatorButton: HTMLElement;
}) {
  expect(screen.queryByLabelText("vision-agent step")).toBeNull();
  expect(titleInput.className).toContain("w-auto");
  expect(titleInput.className).toContain("[field-sizing:content]");
  expect(titleControl.className).toContain("bg-[linear-gradient");
  expect(titleControl.className).toContain("rounded-[10px]");
  expect(titleControl.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(screen.queryByLabelText("vision-agent description")).toBeNull();
  expect(modelInput.className).toContain("w-auto");
  expect(modelInput.className).toContain("max-w-[14rem]");
  expect(titleControl.contains(modelInput)).toBe(true);
  expect(systemInput.className).toContain("[field-sizing:content]");
  expect(toolCreatorButton.textContent).toContain("any");
  expect(screen.queryByLabelText("vision-agent tools")).toBeNull();
  expect(systemInput.getAttribute("rows")).toBe("1");
}
function expectDetachedUserShell(detachedUserSections: HTMLElement) {
  const detachedUserPromptSections = detachedUserSections.firstElementChild;
  expect(detachedUserSections.className).toContain("[--node-shell-gap:2px]");
  expect(detachedUserSections.className).toContain(
    "[--node-shell-radius:16px]",
  );
  expect(detachedUserSections.className).toContain(
    "rounded-(--node-shell-radius)",
  );
  expect(detachedUserSections.className).toContain("border");
  expect(detachedUserSections.className).toContain("bg-[#FBFBFB]");
  expect(detachedUserSections.className).toContain("px-[2px]");
  expect(detachedUserSections.className).toContain("pt-[2px]");
  expect(detachedUserSections.className).toContain("pb-[2px]");
  expect(detachedUserPromptSections?.className).toContain("pt-0");
  expect(detachedUserPromptSections?.className).toContain("pb-0");
}
export function expectDetachedUserRowChrome(
  detachedUserSections: HTMLElement,
  detachedUserRow: HTMLElement,
) {
  const {
    detachedUserCompactButton,
    detachedUserField,
    detachedUserHeader,
    detachedUserTextarea,
    detachedUserToggle,
  } = getDetachedUserRowElements(detachedUserRow, detachedUserSections);
  const detachedUploadElements = getDetachedUserUploadElements(detachedUserRow);
  expectDetachedUserRowShell({
    detachedUserCompactButton,
    detachedUserHeader,
    detachedUserRow,
    detachedUserSections,
    detachedUserTextarea,
    detachedUserToggle,
  });
  expectDetachedUploadTag(detachedUploadElements);
  expectDetachedDatasetTag(detachedUploadElements);
  expectDetachedUserFieldChrome({
    detachedUserField,
    detachedUserSections,
    detachedUserTextarea,
  });
}
function getDetachedUserRowElements(
  detachedUserRow: HTMLElement,
  detachedUserSections: HTMLElement,
) {
  const detachedUserCompactButton = within(detachedUserRow).getByRole(
    "button",
    {
      name: "Minimize vision-agent User section",
    },
  );
  const detachedUserTextarea =
    within(detachedUserSections).getByLabelText("vision-agent User");
  const detachedUserToggle = within(detachedUserRow).getByRole("button", {
    name: "Toggle vision-agent User section",
  });
  const detachedUserHeader =
    detachedUserRow.firstElementChild as HTMLElement | null;
  const detachedUserField =
    detachedUserTextarea.closest("[data-testid='spielwiese-mustache-root']")
      ?.parentElement ?? detachedUserTextarea.parentElement;
  return {
    detachedUserCompactButton,
    detachedUserField,
    detachedUserHeader,
    detachedUserTextarea,
    detachedUserToggle,
  };
}
function getDetachedUserUploadElements(detachedUserRow: HTMLElement) {
  const row = within(detachedUserRow);
  const fileTag = row.getByRole("button", { name: "Upload file" });
  const tagContent = row.getByTestId(
    "spielwiese-detached-user-upload-tag-content",
  );
  const suffixIcon = row.getByTestId(
    "spielwiese-detached-user-upload-suffix-icon",
  );
  const thumb = row.getByTestId("spielwiese-detached-user-upload-thumb");
  const thumbImage = thumb.querySelector("img");
  const datasetTag = row.getByRole("button", { name: "Upload dataset" });
  const datasetInfo = row.getByTestId(
    "spielwiese-detached-user-upload-dataset-info-affordance",
  );
  const datasetIcon = row.getByTestId(
    "spielwiese-detached-user-upload-dataset-icon",
  );
  const datasetInfoIcon = row.getByTestId(
    "spielwiese-detached-user-upload-dataset-info-icon",
  );
  const datasetTooltip = row.getByTestId(
    "spielwiese-detached-user-upload-dataset-tooltip",
  );
  return {
    fileTag,
    datasetInfo,
    datasetInfoIcon,
    tagContent,
    datasetIcon,
    datasetTag,
    datasetTooltip,
    suffixIcon,
    thumb,
    thumbImage,
  };
}
function expectDetachedUserFieldChrome({
  detachedUserField,
  detachedUserSections,
  detachedUserTextarea,
}: {
  detachedUserField: Element | null | undefined;
  detachedUserSections: HTMLElement;
  detachedUserTextarea: HTMLElement;
}) {
  expectShadowedMessageFieldShell(detachedUserField);
  expect(detachedUserField?.className).toContain("min-h-9");
  expect(detachedUserField?.className).toContain("items-center");
  expect(detachedUserTextarea.className).toContain("min-h-6");
  expect(
    within(detachedUserSections).getByTestId("vision-agent-user-tag-icon"),
  ).toBeTruthy();
}
function expectDetachedUserRowShell({
  detachedUserCompactButton,
  detachedUserHeader,
  detachedUserRow,
  detachedUserSections,
  detachedUserTextarea,
  detachedUserToggle,
}: {
  detachedUserCompactButton: HTMLElement;
  detachedUserHeader: HTMLElement | null;
  detachedUserRow: HTMLElement;
  detachedUserSections: HTMLElement;
  detachedUserTextarea: HTMLElement;
  detachedUserToggle: HTMLElement;
}) {
  expect(detachedUserTextarea).toBeTruthy();
  expectDetachedUserShell(detachedUserSections);
  expect(detachedUserRow.className).toContain("border-border/40");
  expect(detachedUserRow.className).toContain("bg-background/96");
  expect(detachedUserRow.className).toContain("overflow-visible");
  expect(detachedUserRow.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(detachedUserRow.className).not.toContain("shadow-[");
  expect(detachedUserRow.contains(detachedUserTextarea)).toBe(false);
  expect(detachedUserSections.contains(detachedUserTextarea)).toBe(true);
  expect(
    detachedUserToggle.querySelector("[data-prefix='true']")?.className,
  ).toContain("size-5");
  expect(detachedUserCompactButton.className).toContain("h-7");
  expect(detachedUserCompactButton.className).toContain("w-7");
  expect(detachedUserCompactButton.getAttribute("aria-pressed")).toBe("false");
  expect(detachedUserHeader?.lastElementChild?.lastElementChild).toBe(
    detachedUserCompactButton,
  );
  expect(detachedUserHeader?.className).not.toContain("min-h-6");
  expect(detachedUserHeader?.className).not.toContain("py-0.5");
}
function expectDetachedDatasetTag({
  datasetInfo,
  datasetInfoIcon,
  datasetIcon,
  datasetTag,
  datasetTooltip,
}: {
  datasetInfo: HTMLElement;
  datasetInfoIcon: HTMLElement;
  datasetIcon: HTMLElement;
  datasetTag: HTMLElement;
  datasetTooltip: HTMLElement;
}) {
  expect(datasetTag.className).toContain("h-6");
  expect(datasetTag.className).toContain("rounded-[8px]");
  expect(datasetTag.className).toContain("border");
  expect(datasetTag.className).toContain("pl-1.5");
  expect(datasetTag.className).toContain("pr-2");
  expect(datasetTag.className).toContain("gap-1.25");
  expect(datasetTag.className).toContain("relative");
  expect(datasetTag.className).toContain("group/dataset-tooltip");
  expect(datasetTag.textContent).toContain("Upload dataset");
  expect(datasetInfo.className).toContain("inline-flex");
  expect(datasetInfo.className).toContain("size-3.5");
  expect(datasetInfo.className).not.toContain("border");
  expect(datasetInfo.className).not.toContain("bg-");
  expect(datasetTooltip.getAttribute("role")).toBe("tooltip");
  expect(datasetTooltip.className).toContain("left-0");
  expect(datasetTooltip.className).not.toContain("right-0");
  expect(datasetTooltip.className).toContain("opacity-0");
  expect(datasetTooltip.className).not.toContain("border");
  expect(datasetTooltip.className).not.toContain("ring-1");
  expect(datasetTooltip.className).toContain(
    "group-hover/dataset-tooltip:opacity-100",
  );
  expect(datasetTooltip.textContent).toContain(
    "Run the same prompt against a batch of user messages at once",
  );
  expect(datasetIcon.getAttribute("class")).toContain("size-3");
  expect(datasetIcon.getAttribute("class")).toContain("text-foreground/32");
  expect(datasetInfoIcon.getAttribute("class")).toContain("size-3");
}
function expectDetachedUploadTag({
  fileTag,
  suffixIcon,
  tagContent,
  thumb,
  thumbImage,
}: {
  fileTag: HTMLElement;
  suffixIcon: HTMLElement;
  tagContent: HTMLElement;
  thumb: HTMLElement;
  thumbImage: HTMLImageElement | null;
}) {
  expect(fileTag.className).toContain("h-6");
  expect(fileTag.className).toContain("overflow-visible");
  expect(fileTag.className).toContain("gap-1.5");
  expect(fileTag.className).toContain("pl-0");
  expect(fileTag.className).toContain("pr-1.5");
  expect(fileTag.textContent).toContain("Upload file");
  expect(tagContent.className).toContain("items-center");
  expect(tagContent.className).toContain("h-full");
  expect(tagContent.className).toContain("gap-1.25");
  expect(tagContent.children[1]).toBe(suffixIcon);
  expect(tagContent.children[2]?.textContent).toBe("Upload file");
  expect(thumb.className).toContain("-ml-px");
  expect(thumb.className).toContain("h-full");
  expect(thumb.className).toContain("aspect-square");
  expect(thumb.className).toContain("rounded-[7px]");
  expect(suffixIcon.getAttribute("class")).toContain("size-3");
  expect(suffixIcon.getAttribute("class")).toContain("text-foreground/32");
  expect(thumb.className).toContain("shadow-[0_1px_2px_rgba(0,0,0,0.22)]");
  expect(thumb.className).toContain(
    "after:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.98)]",
  );
  expect(thumbImage?.getAttribute("src")).toContain("upload-file-thumb.webp");
}
export function expectAttioSectionChip(
  instructionsToggle: HTMLElement,
  nodeCard: HTMLElement,
) {
  expect(instructionsToggle.className).toContain("bg-transparent");
  expect(instructionsToggle.className).toContain("border-0");
  expect(instructionsToggle.className).toContain("px-0");
  expect(instructionsToggle.className).toContain("py-0");
  expect(
    instructionsToggle.querySelector("[data-prefix='true']")?.className,
  ).toContain("size-5");
  expect(
    within(nodeCard)
      .getByTestId("vision-agent-system-icon")
      .getAttribute("class"),
  ).toContain("size-3");
}
export function expectShadowedMessageFieldShell(
  fieldShell: HTMLElement | null,
  expectedBackgroundClassName = "bg-white",
) {
  expect(fieldShell).toBeTruthy();
  expect(fieldShell?.className).toContain("w-full");
  expect(fieldShell?.className).toContain("rounded-[10px]");
  expect(fieldShell?.className).toContain("border-[rgba(0,0,0,0.05)]");
  expect(fieldShell?.className).toContain(expectedBackgroundClassName);
  expect(fieldShell?.className).toContain(assistantReplyCardShadowClassName);
}
