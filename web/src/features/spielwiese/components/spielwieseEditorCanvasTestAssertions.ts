/* eslint-disable max-lines */
import { screen, within } from "@testing-library/react";
const assistantReplyCardShadowClassName =
  "shadow-[0_0_0_3px_var(--spielwiese-agent-node-text-field-halo)]";
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
  expect(toolCreatorButton.getAttribute("aria-disabled")).toBe("true");
  expect(toolCreatorButton.getAttribute("tabindex")).toBe("-1");
  expect(toolCreatorButton.className).toContain("pointer-events-none");
  expect(screen.queryByLabelText("vision-agent tools")).toBeNull();
  expect(systemInput.getAttribute("rows")).toBe("1");
}
function expectDetachedUserShell(detachedUserSections: HTMLElement) {
  const detachedUserCardFrame =
    detachedUserSections.firstElementChild as HTMLElement | null;
  const detachedUserPromptSections = detachedUserCardFrame?.firstElementChild;
  expect(detachedUserSections.className).toContain("[--node-shell-gap:2px]");
  expect(detachedUserSections.className).toContain(
    "[--node-shell-radius:18px]",
  );
  expect(detachedUserSections.className).toContain(
    "rounded-(--node-shell-radius)",
  );
  expect(detachedUserSections.className).toContain("border");
  expect(detachedUserSections.className).toContain(
    "border-[color:var(--spielwiese-agent-node-shell-border)]",
  );
  expect(detachedUserSections.className).toContain(
    "bg-[var(--spielwiese-agent-node-shell-surface)]",
  );
  expect(detachedUserSections.className).toContain("gap-0.5");
  expect(detachedUserSections.className).toContain("shadow-none");
  expect(detachedUserSections.className).toContain("overflow-visible");
  expect(detachedUserCardFrame?.className).toContain(
    "rounded-[var(--node-shell-radius)]",
  );
  expect(detachedUserCardFrame?.className).toContain(
    "bg-[var(--spielwiese-agent-node-shell-surface)]",
  );
  expect(detachedUserCardFrame?.className).toContain("p-0.5");
  expect(detachedUserCardFrame?.className).not.toContain("-mb-0.5");
  expect(detachedUserPromptSections?.className).toContain("pt-0");
  expect(detachedUserPromptSections?.className).toContain("pb-0");
}
export function expectDetachedUserRowChrome(
  detachedUserSections: HTMLElement,
  detachedUserRow: HTMLElement,
) {
  const {
    detachedUserCompactButton,
    detachedUserContentFrame,
    detachedUserContentHeader,
    detachedUserEmbeddedHeader,
    detachedUserEmbeddedShell,
    detachedUserHeader,
    detachedUserHeaderLeading,
    detachedUserPromptShell,
    detachedUserTextarea,
  } = getDetachedUserRowElements(detachedUserRow, detachedUserSections);
  const detachedUploadElements = getDetachedUserUploadElements(detachedUserRow);
  expectDetachedUserRowShell({
    detachedUserCompactButton,
    detachedUserContentFrame,
    detachedUserHeader,
    detachedUserHeaderLeading,
    detachedUserPromptShell,
    detachedUserRow,
    detachedUserSections,
    detachedUserTextarea,
  });
  expectDetachedUploadTag(detachedUploadElements);
  expectDetachedDatasetTag(detachedUploadElements);
  expectDetachedUserFieldChrome({
    detachedUserContentFrame,
    detachedUserContentHeader,
    detachedUserEmbeddedHeader,
    detachedUserEmbeddedShell,
    detachedUserPromptShell,
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
  const detachedUserTextarea = within(detachedUserSections).getByLabelText(
    "vision-agent User message",
  );
  const detachedUserHeader = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-header-strip",
  );
  const detachedUserHeaderLeading = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-header-leading",
  );
  const detachedUserContentFrame = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-content-frame",
  );
  const detachedUserContentHeader = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-content-header",
  );
  const detachedUserEmbeddedHeader = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-embedded-header",
  );
  const detachedUserEmbeddedShell = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-embedded-shell",
  );
  const detachedUserPromptShell = within(detachedUserSections).getByTestId(
    "spielwiese-detached-user-prompt-shell",
  );
  return {
    detachedUserCompactButton,
    detachedUserContentFrame,
    detachedUserContentHeader,
    detachedUserEmbeddedHeader,
    detachedUserEmbeddedShell,
    detachedUserHeader,
    detachedUserHeaderLeading,
    detachedUserPromptShell,
    detachedUserTextarea,
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

function expectDetachedUserContentHeaderSpacing(
  detachedUserContentHeader: HTMLElement,
) {
  expect(detachedUserContentHeader.className).toContain("pt-[6px]");
  expect(detachedUserContentHeader.className).toContain("pr-[6px]");
  expect(detachedUserContentHeader.className).toContain("pb-[6px]");
  expect(detachedUserContentHeader.className).toContain("pl-[6px]");
}

function expectDetachedUserEmbeddedHeaderChrome({
  detachedUserEmbeddedHeader,
  detachedUserEmbeddedShell,
}: {
  detachedUserEmbeddedHeader: HTMLElement;
  detachedUserEmbeddedShell: HTMLElement;
}) {
  expect(detachedUserEmbeddedShell.className).toContain("w-full");
  expect(detachedUserEmbeddedShell.className).toContain(
    "border-[color:var(--spielwiese-agent-node-chrome-border)]",
  );
  expect(detachedUserEmbeddedShell.className).toContain(
    "bg-[var(--spielwiese-agent-node-prompt-frame-surface)]",
  );
  expect(detachedUserEmbeddedShell.className).toContain("gap-px");
  expect(detachedUserEmbeddedShell.className).toContain("px-[2px]");
  expect(detachedUserEmbeddedShell.className).toContain("pb-[2px]");
  expect(detachedUserEmbeddedHeader.className).toContain("gap-1.5");
  expect(detachedUserEmbeddedHeader.className).toContain("ml-[2px]");
  expect(detachedUserEmbeddedHeader.firstElementChild?.className).toContain(
    "ml-[3px]",
  );
  expect(detachedUserEmbeddedShell.className).toContain(
    "[--embedded-prompt-radius:calc(var(--embedded-prompt-outer-radius)-var(--embedded-prompt-padding))]",
  );
  expect(detachedUserEmbeddedHeader.textContent).toContain("User message");
  expect(
    within(detachedUserEmbeddedHeader).getByTestId(
      "vision-agent-user-message-chip-icon",
    ),
  ).toBeTruthy();
  expect(
    within(detachedUserEmbeddedHeader)
      .getByTestId("vision-agent-user-message-chip-icon")
      .getAttribute("class"),
  ).toContain("lucide-message-circle");
}

function expectDetachedUserFieldChrome({
  detachedUserContentFrame,
  detachedUserContentHeader,
  detachedUserEmbeddedHeader,
  detachedUserEmbeddedShell,
  detachedUserPromptShell,
  detachedUserTextarea,
}: {
  detachedUserContentFrame: HTMLElement;
  detachedUserContentHeader: HTMLElement;
  detachedUserEmbeddedHeader: HTMLElement;
  detachedUserEmbeddedShell: HTMLElement;
  detachedUserPromptShell: HTMLElement;
  detachedUserTextarea: HTMLElement;
}) {
  expect(detachedUserContentFrame.className).toContain("pt-0");
  expect(detachedUserContentFrame.className).toContain("pb-px");
  expect(detachedUserContentFrame.className).toContain("text-base");
  expect(detachedUserContentFrame.className).not.toContain("border-[");
  expect(detachedUserContentFrame.className).not.toContain("bg-white");
  expect(detachedUserContentFrame.className).not.toContain("pt-[6px]");
  expect(detachedUserContentFrame.className).not.toContain("pr-[6px]");
  expect(detachedUserContentFrame.className).not.toContain("pb-[6px]");
  expect(detachedUserContentFrame.className).not.toContain("pl-[6px]");
  expectDetachedUserContentHeaderSpacing(detachedUserContentHeader);
  expectDetachedUserEmbeddedHeaderChrome({
    detachedUserEmbeddedHeader,
    detachedUserEmbeddedShell,
  });
  expect(
    (detachedUserContentFrame.firstElementChild as HTMLElement | null)
      ?.className,
  ).toContain("bg-background/96");
  expect(
    (detachedUserContentFrame.firstElementChild as HTMLElement | null)
      ?.className,
  ).toContain("border-border/40");
  expect(
    (detachedUserContentFrame.firstElementChild as HTMLElement | null)
      ?.className,
  ).toContain("pb-[4px]");
  expect(detachedUserPromptShell.className).toContain("w-full");
  expect(detachedUserPromptShell.className).toContain(
    "bg-[var(--spielwiese-agent-node-prompt-value-surface)]",
  );
  expect(detachedUserPromptShell.className).toContain(
    "rounded-[calc(var(--embedded-prompt-radius)-var(--embedded-prompt-padding))]",
  );
  expect(detachedUserPromptShell.className).toContain(
    "shadow-[inset_0_0_0_1px_var(--spielwiese-agent-node-prompt-value-border)]",
  );
  expect(detachedUserTextarea.className).toContain("min-h-6");
  expect(detachedUserTextarea.className).toContain("px-3");
  expect(detachedUserTextarea.className).toContain("py-1");
}

// eslint-disable-next-line max-lines-per-function
function expectDetachedUserRowShell({
  detachedUserCompactButton,
  detachedUserContentFrame,
  detachedUserHeader,
  detachedUserHeaderLeading,
  detachedUserPromptShell,
  detachedUserRow,
  detachedUserSections,
  detachedUserTextarea,
}: {
  detachedUserCompactButton: HTMLElement;
  detachedUserContentFrame: HTMLElement;
  detachedUserHeader: HTMLElement | null;
  detachedUserHeaderLeading: HTMLElement;
  detachedUserPromptShell: HTMLElement;
  detachedUserRow: HTMLElement;
  detachedUserSections: HTMLElement;
  detachedUserTextarea: HTMLElement;
}) {
  expect(detachedUserTextarea).toBeTruthy();
  expectDetachedUserShell(detachedUserSections);
  expect(detachedUserRow.className).toContain("overflow-visible");
  expect(detachedUserRow.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(detachedUserRow.className).toContain("gap-0");
  expect(detachedUserRow.className).toContain("pt-0");
  expect(detachedUserRow.className).toContain("pb-0");
  expect(detachedUserRow.className).not.toContain("shadow-[");
  expect(detachedUserRow.contains(detachedUserTextarea)).toBe(true);
  expect(detachedUserSections.contains(detachedUserTextarea)).toBe(true);
  expect(detachedUserContentFrame.contains(detachedUserHeader)).toBe(true);
  expect(detachedUserContentFrame.contains(detachedUserPromptShell)).toBe(true);
  expect(
    detachedUserHeaderLeading.querySelector("[data-prefix='true']")?.className,
  ).toContain("h-full");
  expect(
    detachedUserHeaderLeading.querySelector("[data-prefix='true']")?.className,
  ).toContain("w-6");
  expect(
    detachedUserHeaderLeading.querySelector("[data-prefix='true']")?.className,
  ).toContain("border-r");
  expect(detachedUserHeaderLeading.textContent).toContain("User");
  expect(
    within(detachedUserHeaderLeading).getByTestId(
      "vision-agent-user-chip-icon",
    ),
  ).toBeTruthy();
  expect(
    within(detachedUserHeaderLeading)
      .getByTestId("vision-agent-user-chip-icon")
      .getAttribute("class"),
  ).toContain("lucide-user-round");
  expect(
    within(detachedUserHeaderLeading).queryByRole("button", {
      name: "Toggle vision-agent User section",
    }),
  ).toBeNull();
  expect(detachedUserCompactButton.className).toContain("size-7");
  expect(detachedUserCompactButton.getAttribute("aria-pressed")).toBe("false");
  expect(detachedUserHeader?.contains(detachedUserCompactButton)).toBe(true);
  expect(detachedUserHeader?.className).toContain("justify-between");
  expect(detachedUserHeader?.textContent).toContain("User");
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
  expect(instructionsToggle.className).toContain("px-3");
  expect(instructionsToggle.className).toContain("py-1");
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
  expect(fieldShell?.className).toContain(
    "border-[color:var(--spielwiese-agent-node-chrome-border)]",
  );
  expect(fieldShell?.className).toContain(expectedBackgroundClassName);
  expect(fieldShell?.className).toContain(assistantReplyCardShadowClassName);
}
