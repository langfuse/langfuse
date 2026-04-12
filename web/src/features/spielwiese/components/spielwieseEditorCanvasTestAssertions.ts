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
  expect(detachedUserSections.className).toContain("overflow-visible");
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
  const inlineAccessories = row.getByTestId(
    "spielwiese-detached-user-inline-accessories",
  );
  const fileTag = row.getByRole("button", { name: "Upload file" });
  const fileAccessory = fileTag.closest("dd");
  const tagContent = row.getByTestId(
    "spielwiese-detached-user-upload-tag-content",
  );
  const suffixIcon = row.getByTestId(
    "spielwiese-detached-user-upload-suffix-icon",
  );
  const thumb = row.getByTestId("spielwiese-detached-user-upload-thumb");
  const thumbImage = thumb.querySelector("img");
  const datasetAccessory = row.getByTestId(
    "spielwiese-detached-user-upload-dataset-accessory",
  );
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
  const datasetDocsLink = within(datasetTooltip).getByRole("link", {
    name: "Docs",
  });
  return {
    datasetAccessory,
    datasetDocsLink,
    datasetInfo,
    fileAccessory,
    fileTag,
    datasetInfoIcon,
    inlineAccessories,
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
  expect(detachedUserRow.className).toContain("gap-1.5");
  expect(detachedUserRow.className).not.toContain("shadow-[");
  expect(detachedUserRow.contains(detachedUserTextarea)).toBe(true);
  expect(detachedUserSections.contains(detachedUserTextarea)).toBe(true);
  expect(
    detachedUserToggle.querySelector("[data-prefix='true']")?.className,
  ).toContain("h-full");
  expect(
    detachedUserToggle.querySelector("[data-prefix='true']")?.className,
  ).toContain("w-6");
  expect(
    detachedUserToggle.querySelector("[data-prefix='true']")?.className,
  ).toContain("border-r");
  expect(detachedUserToggle.className).toContain("rounded-[10px]");
  expect(detachedUserToggle.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(detachedUserToggle.className).toContain("bg-background");
  expect(detachedUserToggle.className).toContain("ring-1");
  expect(detachedUserToggle.className).not.toContain("bg-[linear-gradient");
  expect(detachedUserCompactButton.className).toContain("h-7");
  expect(detachedUserCompactButton.className).toContain("w-7");
  expect(detachedUserCompactButton.getAttribute("aria-pressed")).toBe("false");
  expect(
    detachedUserHeader?.lastElementChild?.lastElementChild?.firstElementChild,
  ).toBe(detachedUserCompactButton);
  expect(detachedUserHeader?.className).not.toContain("min-h-6");
  expect(detachedUserHeader?.className).not.toContain("py-0.5");
}
function expectDetachedDatasetTag({
  datasetAccessory,
  datasetDocsLink,
  datasetInfo,
  datasetInfoIcon,
  datasetIcon,
  datasetTag,
  datasetTooltip,
  inlineAccessories,
}: {
  datasetAccessory: HTMLElement;
  datasetDocsLink: HTMLElement;
  datasetInfo: HTMLElement;
  datasetInfoIcon: HTMLElement;
  datasetIcon: HTMLElement;
  datasetTag: HTMLElement;
  datasetTooltip: HTMLElement;
  inlineAccessories: HTMLElement;
}) {
  expect(inlineAccessories.tagName).toBe("DL");
  expect(inlineAccessories.className).toContain("flex");
  expect(inlineAccessories.className).toContain("min-w-0");
  expect(inlineAccessories.className).toContain("shrink-0");
  expect(inlineAccessories.className).toContain("items-center");
  expect(inlineAccessories.className).toContain("gap-1");
  expectDetachedDatasetAccessoryChrome({
    datasetAccessory,
    datasetInfo,
    datasetTag,
  });
  expectDetachedDatasetTooltipChrome({
    datasetDocsLink,
    datasetInfo,
    datasetTooltip,
  });
  expectDetachedDatasetIcons({
    datasetIcon,
    datasetInfoIcon,
  });
}

function expectDetachedDatasetAccessoryChrome({
  datasetAccessory,
  datasetInfo,
  datasetTag,
}: {
  datasetAccessory: HTMLElement;
  datasetInfo: HTMLElement;
  datasetTag: HTMLElement;
}) {
  expect(datasetAccessory.tagName).toBe("DD");
  expect(datasetAccessory.className).toContain("h-7");
  expect(datasetAccessory.className).toContain("rounded-[8px]");
  expect(datasetAccessory.className).toContain("border");
  expect(datasetAccessory.className).toContain("bg-background");
  expect(datasetAccessory.className).toContain("relative");
  expect(datasetAccessory.className).toContain("overflow-visible");
  expect(datasetAccessory.childElementCount).toBe(2);
  expect(datasetAccessory.children[0]).toBe(datasetTag);
  expect(datasetAccessory.children[1]).toBe(datasetInfo);
  expect(datasetTag.className).toContain("h-full");
  expect(datasetTag.className).toContain("pr-7");
  expect(datasetTag.className).toContain("bg-transparent");
  expect(datasetTag.className).toContain("px-0");
  expect(datasetTag.textContent).toContain("Upload dataset");
  expect(datasetTag.firstElementChild?.className).toContain("border-r");
  expect(datasetTag.firstElementChild?.className).toContain("w-6");
  expect(datasetInfo.className).toContain("group/dataset-tooltip");
  expect(datasetInfo.className).toContain("absolute");
  expect(datasetInfo.className).toContain("right-1.5");
  expect(datasetInfo.className).toContain("inline-flex");
  expect(datasetInfo.className).toContain("size-3.5");
  expect(datasetInfo.className).toContain("after:top-full");
  expect(datasetInfo.className).toContain("after:h-2");
  expect(datasetInfo.className).toContain("after:w-[15rem]");
  expect(datasetInfo.className).not.toContain("border");
  expect(datasetInfo.className).not.toContain("bg-");
  expect(datasetInfo.parentElement).toBe(datasetAccessory);
}

function expectDetachedDatasetTooltipChrome({
  datasetDocsLink,
  datasetInfo,
  datasetTooltip,
}: {
  datasetDocsLink: HTMLElement;
  datasetInfo: HTMLElement;
  datasetTooltip: HTMLElement;
}) {
  expect(datasetTooltip.parentElement).toBe(datasetInfo);
  expect(datasetTooltip.getAttribute("role")).toBe("tooltip");
  expect(datasetTooltip.className).toContain("left-0");
  expect(datasetTooltip.className).not.toContain("right-0");
  expect(datasetTooltip.className).toContain("text-left");
  expect(datasetTooltip.className).toContain("text-[0.6875rem]");
  expect(datasetTooltip.className).toContain("font-normal");
  expect(datasetTooltip.className).toContain("pointer-events-none");
  expect(datasetTooltip.className).toContain("opacity-0");
  expect(datasetTooltip.className).not.toContain("border");
  expect(datasetTooltip.className).not.toContain("ring-1");
  expect(datasetTooltip.className).toContain(
    "group-hover/dataset-tooltip:opacity-100",
  );
  expect(datasetTooltip.className).toContain(
    "group-hover/dataset-tooltip:pointer-events-auto",
  );
  expect(datasetTooltip.textContent).toContain(
    "Run the same prompt against a batch of user messages at once",
  );
  expect(datasetDocsLink.className).toContain("inline");
  expect(datasetDocsLink.className).not.toContain("mt-2");
  expect(datasetDocsLink.textContent).toBe("Docs");
  expect(datasetDocsLink.getAttribute("href")).toBe(
    "https://langfuse.com/docs/evaluation/experiments/overview",
  );
  expect(datasetDocsLink.getAttribute("target")).toBe("_blank");
}

function expectDetachedDatasetIcons({
  datasetIcon,
  datasetInfoIcon,
}: {
  datasetIcon: HTMLElement;
  datasetInfoIcon: HTMLElement;
}) {
  expect(datasetIcon.getAttribute("class")).toContain("size-3");
  expect(datasetIcon.getAttribute("class")).toContain("text-foreground/32");
  expect(datasetInfoIcon.getAttribute("class")).toContain("size-3");
}
function expectDetachedUploadTag({
  fileAccessory,
  fileTag,
  suffixIcon,
  tagContent,
  thumb,
  thumbImage,
}: {
  fileAccessory: HTMLElement | null;
  fileTag: HTMLElement;
  suffixIcon: HTMLElement;
  tagContent: HTMLElement;
  thumb: HTMLElement;
  thumbImage: HTMLImageElement | null;
}) {
  expect(fileAccessory?.tagName).toBe("DD");
  expect(fileAccessory?.className).toContain("h-7");
  expect(fileAccessory?.className).toContain("rounded-[8px]");
  expect(fileAccessory?.className).toContain("border");
  expect(fileAccessory?.className).toContain("bg-background");
  expect(fileTag.className).toContain("h-full");
  expect(fileTag.className).toContain("overflow-visible");
  expect(fileTag.className).toContain("bg-transparent");
  expect(fileTag.className).toContain("px-0");
  expect(fileTag.textContent).toContain("Upload file");
  expect(tagContent.className).toContain("items-center");
  expect(tagContent.className).toContain("px-2");
  expect(tagContent.className).toContain("gap-1.25");
  expect(tagContent.children[0]).toBe(suffixIcon);
  expect(tagContent.children[1]?.textContent).toBe("Upload file");
  expect(thumb.className).toContain("size-5");
  expect(thumb.className).toContain("rounded-[6px]");
  expect(suffixIcon.getAttribute("class")).toContain("size-3");
  expect(suffixIcon.getAttribute("class")).toContain("text-foreground/32");
  expect(thumb.className).toContain("shadow-[0_1px_2px_rgba(0,0,0,0.22)]");
  expect(thumb.className).toContain(
    "after:shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.98)]",
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
  ).toContain("size-4");
  expect(
    within(nodeCard)
      .getByTestId("vision-agent-system-icon")
      .getAttribute("class"),
  ).toContain("size-2.5");
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
