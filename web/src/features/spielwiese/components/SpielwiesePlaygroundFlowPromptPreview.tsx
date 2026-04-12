import { Settings2, type LucideIcon, UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  spielwieseEmbeddedPromptInnerRadiusClassName,
  spielwieseEmbeddedPromptRadiusClassName,
  spielwieseEmbeddedPromptRadiusVariablesClassName,
  spielwieseMessageFieldShellClassName,
} from "./SpielwieseMessageSectionBody";
import { getPromptSectionDisplayLabel } from "./spielwiesePromptSectionLabels";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";

function getPreviewPrefixIcon(messageKind: string): LucideIcon | null {
  if (messageKind === "system" || messageKind === "assistant") {
    return Settings2;
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
    value: section.value,
  };
}

function PlaygroundFlowPromptPreviewHeader({
  PreviewIcon,
  isEmbedded = false,
  previewLabel,
  toneClassNames,
}: {
  PreviewIcon: LucideIcon | null;
  isEmbedded?: boolean;
  previewLabel: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 overflow-visible",
        isEmbedded && "ml-[5px]",
      )}
      data-testid={
        isEmbedded
          ? "spielwiese-playground-flow-preview-embedded-header"
          : undefined
      }
    >
      <div className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
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
  previewLabel,
  toneClassNames,
  value,
}: {
  format: "json" | "text";
  PreviewIcon: LucideIcon | null;
  previewLabel: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
  value: string;
}) {
  return (
    <div
      className={cn("pt-0 pb-px text-base", toneClassNames.body)}
      data-testid="spielwiese-playground-flow-preview-body"
    >
      <div
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden border border-[rgba(0,0,0,0.05)] bg-[#F1F2F2] px-[2px] pt-0 pb-[2px] shadow-none",
          spielwieseEmbeddedPromptRadiusVariablesClassName,
          spielwieseEmbeddedPromptRadiusClassName,
          "gap-px",
        )}
        data-testid="spielwiese-playground-flow-preview-field-shell"
      >
        <PlaygroundFlowPromptPreviewHeader
          PreviewIcon={PreviewIcon}
          isEmbedded
          previewLabel={previewLabel}
          toneClassNames={toneClassNames}
        />
        <div
          className={cn(
            "flex min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden bg-[#FBFBFB] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
            spielwieseEmbeddedPromptInnerRadiusClassName,
          )}
        >
          <div
            className={cn(
              "text-foreground w-full min-w-0 bg-transparent px-3 py-1 text-base leading-7 break-words whitespace-pre-wrap sm:text-[0.9375rem]",
              format === "json" &&
                "font-mono text-[13px] leading-5 sm:text-[13px]",
            )}
            data-testid="spielwiese-playground-flow-preview-value"
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaygroundFlowPromptPreviewBody({
  format,
  isSystemSection,
  PreviewIcon,
  previewLabel,
  toneClassNames,
  value,
}: {
  format: "json" | "text";
  isSystemSection: boolean;
  PreviewIcon: LucideIcon | null;
  previewLabel: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
  value: string;
}) {
  if (isSystemSection) {
    return (
      <PlaygroundFlowSystemPromptPreview
        PreviewIcon={PreviewIcon}
        format={format}
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
            "text-foreground w-full min-w-0 text-base leading-7 break-words whitespace-pre-wrap sm:text-[0.9375rem]",
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

  return (
    <div
      className={cn(
        "group flex w-full min-w-0 flex-col overflow-hidden",
        messageKind === "user"
          ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] px-2.5 pt-1 pb-2"
          : "rounded-xl px-[5px] pt-0 pb-0",
        toneClassNames.surface,
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
        toneClassNames={toneClassNames}
        value={preview.value}
      />
    </div>
  );
}
