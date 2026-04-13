import { Bot, type LucideIcon, UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  SpielwieseEmbeddedPromptFrame,
  spielwieseMessageFieldShellClassName,
} from "./SpielwieseMessageSectionBody";
import {
  spielwieseMessageSectionChipPaddingStyle,
  spielwieseMessageSectionChipVariableStyle,
} from "./spielwieseAgentNodeColorPalette";
import { getPromptSectionDisplayLabel } from "./spielwiesePromptSectionLabels";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";

function getPreviewPrefixIcon(messageKind: string): LucideIcon | null {
  if (messageKind === "system" || messageKind === "assistant") {
    return Bot;
  }

  if (messageKind === "user") {
    return UserRound;
  }

  return null;
}

export type PlaygroundFlowPreviewVM = {
  format: "json" | "text";
  label: string;
  sectionId: string;
  state?: "streaming" | "settled";
  value: string;
};

export function getPlaygroundFlowPreview(
  node: SpielwieseAgentNodeVM,
): PlaygroundFlowPreviewVM | undefined {
  if (node.playgroundPreview) {
    return {
      format: node.playgroundPreview.format,
      label: node.playgroundPreview.label,
      sectionId: node.playgroundPreview.toneSectionId ?? "system",
      state: "settled",
      value: node.playgroundPreview.value,
    };
  }

  if ((node.layout ?? "composite") === "user-only") {
    return undefined;
  }

  const section =
    node.promptSections.find(
      (candidateSection) => getMessageKind(candidateSection.id) === "system",
    ) ??
    node.promptSections.find(
      (candidateSection) => candidateSection.value.trim().length > 0,
    );

  if (!section) {
    return undefined;
  }

  return {
    format: "text",
    label: getPromptSectionDisplayLabel(section.id, section.label),
    sectionId: section.id,
    state: "settled",
    value: section.value,
  };
}

type PlaygroundFlowPromptPreviewHeaderProps = {
  PreviewIcon: LucideIcon | null;
  isEmbedded?: boolean;
  previewLabel: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
};

function PlaygroundFlowPromptPreviewHeader({
  PreviewIcon,
  isEmbedded = false,
  previewLabel,
  toneClassNames,
}: PlaygroundFlowPromptPreviewHeaderProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 overflow-visible",
        isEmbedded && "ml-[2px]",
      )}
      data-testid={
        isEmbedded
          ? "spielwiese-playground-flow-preview-embedded-header"
          : undefined
      }
    >
      <div
        className="inline-flex min-w-0 shrink-0 items-center gap-1.5 pt-[var(--spielwiese-message-section-chip-padding-top)] pr-[var(--spielwiese-message-section-chip-padding-right)] pb-[var(--spielwiese-message-section-chip-padding-bottom)] pl-[var(--spielwiese-message-section-chip-padding-left)]"
        data-testid="spielwiese-playground-flow-preview-label-group"
        style={{
          ...spielwieseMessageSectionChipVariableStyle,
          ...spielwieseMessageSectionChipPaddingStyle,
        }}
      >
        {PreviewIcon ? (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex shrink-0 items-center justify-center border shadow-none",
              isEmbedded ? "size-4 rounded-[5px]" : "size-5 rounded-[6px]",
              toneClassNames.chip,
            )}
          >
            <PreviewIcon
              className={cn(
                isEmbedded ? "size-2.5" : "size-3",
                "shrink-0",
                toneClassNames.label,
              )}
            />
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 text-[13px] font-medium tracking-[-0.01em]",
            isEmbedded ? "leading-4.5" : "leading-5",
            toneClassNames.label,
          )}
        >
          {previewLabel}
        </span>
      </div>
    </div>
  );
}

function PlaygroundFlowSystemPromptPreview({
  format,
  PreviewIcon,
  previewValueClassName,
  previewLabel,
  toneClassNames,
  value,
}: {
  format: "json" | "text";
  PreviewIcon: LucideIcon | null;
  previewValueClassName: string;
  previewLabel: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
  value: string;
}) {
  return (
    <SpielwieseEmbeddedPromptFrame
      bodyClassName={toneClassNames.body}
      bodyTestId="spielwiese-playground-flow-preview-body"
      header={
        <PlaygroundFlowPromptPreviewHeader
          PreviewIcon={PreviewIcon}
          isEmbedded
          previewLabel={previewLabel}
          toneClassNames={toneClassNames}
        />
      }
      promptShellClassName="min-h-0"
      shellTestId="spielwiese-playground-flow-preview-field-shell"
    >
      <div
        className={cn(
          "text-foreground min-h-10 bg-transparent px-3 py-1 text-base leading-7 sm:text-[0.9375rem]",
          previewValueClassName,
          format === "json" && "font-mono text-[13px] leading-5 sm:text-[13px]",
        )}
        data-testid="spielwiese-playground-flow-preview-value"
      >
        {value}
      </div>
    </SpielwieseEmbeddedPromptFrame>
  );
}

function PlaygroundFlowPromptPreviewBody({
  format,
  isSystemSection,
  PreviewIcon,
  previewLabel,
  previewValueClassName,
  toneClassNames,
  value,
}: {
  format: "json" | "text";
  isSystemSection: boolean;
  PreviewIcon: LucideIcon | null;
  previewLabel: string;
  previewValueClassName: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
  value: string;
}) {
  if (isSystemSection) {
    return (
      <PlaygroundFlowSystemPromptPreview
        PreviewIcon={PreviewIcon}
        format={format}
        previewValueClassName={previewValueClassName}
        previewLabel={previewLabel}
        toneClassNames={toneClassNames}
        value={value}
      />
    );
  }

  return (
    <div
      className={cn("pt-[9px] pb-0.5 text-base", toneClassNames.body)}
      data-testid="spielwiese-playground-flow-preview-body"
    >
      <div
        className={cn(spielwieseMessageFieldShellClassName)}
        data-testid="spielwiese-playground-flow-preview-field-shell"
      >
        <div
          className={cn(
            "text-foreground min-h-10 text-base leading-7 sm:text-[0.9375rem]",
            previewValueClassName,
            format === "json" &&
              "font-mono text-[13px] leading-5 sm:text-[13px]",
          )}
          data-testid="spielwiese-playground-flow-preview-value"
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export function SpielwiesePlaygroundFlowPromptPreview({
  preview,
}: {
  preview: PlaygroundFlowPreviewVM | undefined;
}) {
  if (!preview) {
    return null;
  }

  const toneClassNames = getMessageToneClassNames(preview.sectionId);
  const messageKind = getMessageKind(preview.sectionId);
  const PreviewIcon = getPreviewPrefixIcon(messageKind);
  const previewLabel = preview.label;
  const isSystemSection = messageKind === "system";
  const isPreviewEmpty =
    preview.state === "streaming" && preview.value.length === 0;
  const previewValueClassName = cn(
    "w-full min-w-0 break-words whitespace-pre-wrap transition-[opacity,transform,filter] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
    isPreviewEmpty
      ? "translate-y-0.5 opacity-0 blur-[2px]"
      : "translate-y-0 opacity-100 blur-0",
  );

  return (
    <div
      className={cn(
        "group flex w-full min-w-0 flex-col overflow-hidden",
        messageKind === "user"
          ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] px-2.5 pt-1 pb-2"
          : "border-border/40 bg-background/96 rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border px-0 pt-0 pb-0",
        messageKind === "user" && toneClassNames.surface,
      )}
      data-section-id={preview.sectionId}
      data-testid="spielwiese-playground-flow-preview-row"
    >
      {isSystemSection ? null : (
        <PlaygroundFlowPromptPreviewHeader
          PreviewIcon={PreviewIcon}
          previewLabel={previewLabel}
          toneClassNames={toneClassNames}
        />
      )}
      <PlaygroundFlowPromptPreviewBody
        format={preview.format}
        isSystemSection={isSystemSection}
        PreviewIcon={PreviewIcon}
        previewLabel={previewLabel}
        previewValueClassName={previewValueClassName}
        toneClassNames={toneClassNames}
        value={preview.value}
      />
    </div>
  );
}
