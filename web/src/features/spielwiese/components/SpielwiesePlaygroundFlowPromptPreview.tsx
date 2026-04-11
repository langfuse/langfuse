import { Settings2, type LucideIcon, UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { spielwieseMessageFieldShellClassName } from "./SpielwieseMessageSectionBody";
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

type PlaygroundFlowPreviewVM = {
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
  previewLabel,
  toneClassNames,
}: {
  PreviewIcon: LucideIcon | null;
  previewLabel: string;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-visible">
      <div className="inline-flex shrink-0 items-center gap-1.5">
        {PreviewIcon ? (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border shadow-none",
              toneClassNames.chip,
            )}
          >
            <PreviewIcon
              className={cn("size-3 shrink-0", toneClassNames.label)}
            />
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 text-[13px] leading-5 font-medium tracking-[-0.01em]",
            toneClassNames.label,
          )}
        >
          {previewLabel}
        </span>
      </div>
    </div>
  );
}

function PlaygroundFlowPromptPreviewBody({
  format,
  isSystemSection,
  toneClassNames,
  value,
}: {
  format: "json" | "text";
  isSystemSection: boolean;
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
  value: string;
}) {
  return (
    <div
      className={cn("pt-[9px] pb-0.5 text-base", toneClassNames.body)}
      data-testid="spielwiese-playground-flow-preview-body"
    >
      <div
        className={cn(
          spielwieseMessageFieldShellClassName,
          isSystemSection &&
            "min-h-0 flex-col items-stretch bg-[#F1F2F2] px-0 py-0",
        )}
        data-testid="spielwiese-playground-flow-preview-field-shell"
      >
        <div
          className={cn(
            "text-foreground w-full min-w-0 text-base leading-7 break-words whitespace-pre-wrap sm:text-[0.9375rem]",
            format === "json" &&
              "font-mono text-[13px] leading-5 sm:text-[13px]",
            isSystemSection &&
              "rounded-[10px] bg-[#FBFBFB] px-3 py-1 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
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
        "group flex w-full min-w-0 flex-col overflow-hidden px-2.5 pt-1 pb-2",
        messageKind === "user"
          ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]"
          : "rounded-xl",
        toneClassNames.surface,
      )}
      data-section-id={preview.sectionId}
      data-testid="spielwiese-playground-flow-preview-row"
    >
      <PlaygroundFlowPromptPreviewHeader
        PreviewIcon={PreviewIcon}
        previewLabel={previewLabel}
        toneClassNames={toneClassNames}
      />
      <PlaygroundFlowPromptPreviewBody
        format={preview.format}
        isSystemSection={isSystemSection}
        toneClassNames={toneClassNames}
        value={preview.value}
      />
    </div>
  );
}
