import type { ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import { SpielwieseMustacheTextarea } from "./SpielwieseMustacheTextarea";
import {
  SpielwieseToolMessageSection,
  type SpielwieseToolOption,
} from "./SpielwieseToolMessageSection";
import {
  isOnboardingChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";

export const spielwieseInlineTextareaClassName =
  "h-full rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";
export const spielwieseMessageFieldShellClassName =
  "flex min-h-9 w-full min-w-0 items-center overflow-hidden rounded-[10px] border border-[color:var(--spielwiese-agent-node-chrome-border)] bg-[var(--spielwiese-agent-node-text-field-surface)] px-3 py-1 shadow-[0_0_0_3px_var(--spielwiese-agent-node-text-field-halo)]";
export const spielwieseEmbeddedPromptBodyClassName = "pt-0 pb-px text-base";
export const spielwieseEmbeddedPromptFieldShellClassName =
  "flex min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden border border-[color:var(--spielwiese-agent-node-chrome-border)] bg-[var(--spielwiese-agent-node-prompt-frame-surface)] px-[2px] pt-0 pb-[2px] shadow-none";
export const spielwieseEmbeddedPromptValueShellClassName =
  "flex min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden bg-[var(--spielwiese-agent-node-prompt-value-surface)] shadow-[inset_0_0_0_1px_var(--spielwiese-agent-node-prompt-value-border)]";
const spielwieseSingleLineTextareaBaseClassName = `${spielwieseInlineTextareaClassName} [field-sizing:content] min-h-6 w-full overflow-hidden bg-transparent text-base leading-7 sm:text-[0.9375rem]`;
export const spielwieseSingleLineTextareaClassName = `${spielwieseSingleLineTextareaBaseClassName} rounded-[10px]`;
const spielwieseEmbeddedPromptRadiusVariablesClassName =
  "[--embedded-prompt-padding:2px] [--embedded-prompt-outer-radius:calc(var(--node-shell-radius)-var(--node-shell-gap))] [--embedded-prompt-radius:calc(var(--embedded-prompt-outer-radius)-var(--embedded-prompt-padding))]";
const spielwieseEmbeddedPromptRadiusClassName =
  "rounded-[var(--embedded-prompt-radius)]";
const spielwieseEmbeddedPromptInnerRadiusClassName =
  "rounded-[calc(var(--embedded-prompt-radius)-var(--embedded-prompt-padding))]";
const spielwieseEmbeddedSingleLineTextareaClassName = `${spielwieseSingleLineTextareaBaseClassName} ${spielwieseEmbeddedPromptInnerRadiusClassName}`;
export {
  spielwieseEmbeddedPromptInnerRadiusClassName,
  spielwieseEmbeddedPromptRadiusClassName,
  spielwieseEmbeddedPromptRadiusVariablesClassName,
  spielwieseEmbeddedSingleLineTextareaClassName,
};

export function SpielwieseEmbeddedPromptFrame({
  bodyClassName,
  bodyTestId,
  children,
  fieldShellClassName,
  header,
  promptShellClassName,
  promptShellTestId,
  shellTestId,
}: {
  bodyClassName?: string;
  bodyTestId?: string;
  children: ReactNode;
  fieldShellClassName?: string;
  header?: ReactNode;
  promptShellClassName?: string;
  promptShellTestId?: string;
  shellTestId?: string;
}) {
  return (
    <div
      className={cn(spielwieseEmbeddedPromptBodyClassName, bodyClassName)}
      data-testid={bodyTestId}
    >
      <div
        className={cn(
          spielwieseEmbeddedPromptFieldShellClassName,
          spielwieseEmbeddedPromptRadiusVariablesClassName,
          spielwieseEmbeddedPromptRadiusClassName,
          header && "gap-px",
          fieldShellClassName,
        )}
        data-testid={shellTestId}
      >
        {header}
        <div
          className={cn(
            spielwieseEmbeddedPromptValueShellClassName,
            spielwieseEmbeddedPromptInnerRadiusClassName,
            promptShellClassName,
          )}
          data-testid={promptShellTestId}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type SpielwieseMessageSectionBodyProps = {
  header?: ReactNode;
  nodeId: string;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  section: SpielwieseAgentNodeVM["promptSections"][number];
  toolOptions: SpielwieseToolOption[];
};

function getPromptSectionPlaceholder(
  section: SpielwieseAgentNodeVM["promptSections"][number],
  isOnboardingPreview: boolean,
) {
  const messageKind = getMessageKind(section.id);

  if (messageKind === "system") {
    if (isOnboardingPreview) {
      return "Act as if you were a senior business strategist";
    }

    return "Add instructions for this step";
  }

  return `Write ${section.label.toLowerCase()}`;
}

function EmbeddedMessageSectionHeader({ header }: { header?: ReactNode }) {
  if (!header) {
    return null;
  }

  return <div className="pb-px">{header}</div>;
}

function StandardPromptTextarea({
  className,
  nodeId,
  onPromptSectionChange,
  rootClassName,
  section,
  textareaClassName = spielwieseSingleLineTextareaClassName,
}: Pick<
  SpielwieseMessageSectionBodyProps,
  "nodeId" | "onPromptSectionChange" | "section"
> & {
  className?: string;
  rootClassName?: string;
  textareaClassName?: string;
}) {
  const toneClassNames = getMessageToneClassNames(section.id);
  const chrome = useSpielwieseEditorCanvasChrome();
  const isOnboardingPreview = isOnboardingChrome(chrome);

  return (
    <SpielwieseMustacheTextarea
      aria-label={`${nodeId} ${section.label}`}
      className={cn(toneClassNames.field, textareaClassName, className)}
      name={`${nodeId}-${section.id}`}
      onChange={(event) =>
        onPromptSectionChange(nodeId, section.id, event.target.value)
      }
      placeholder={getPromptSectionPlaceholder(section, isOnboardingPreview)}
      rootClassName={rootClassName}
      rows={1}
      value={section.value}
    />
  );
}

function SpielwieseSystemMessageSectionBody({
  header,
  nodeId,
  onPromptSectionChange,
  section,
}: Pick<
  SpielwieseMessageSectionBodyProps,
  "header" | "nodeId" | "onPromptSectionChange" | "section"
>) {
  const toneClassNames = getMessageToneClassNames(section.id);
  const shouldRenderEmbeddedHeader = Boolean(header);

  return (
    <SpielwieseEmbeddedPromptFrame
      bodyClassName={toneClassNames.body}
      fieldShellClassName={cn(shouldRenderEmbeddedHeader && "shadow-none")}
      header={header}
      promptShellTestId="spielwiese-system-message-prompt-shell"
    >
      <StandardPromptTextarea
        className="bg-transparent px-3 py-1 shadow-none"
        nodeId={nodeId}
        onPromptSectionChange={onPromptSectionChange}
        rootClassName={spielwieseEmbeddedPromptInnerRadiusClassName}
        section={section}
        textareaClassName={spielwieseEmbeddedSingleLineTextareaClassName}
      />
    </SpielwieseEmbeddedPromptFrame>
  );
}

function SpielwieseDefaultMessageSectionBody({
  header,
  nodeId,
  onPromptSectionChange,
  section,
}: Pick<
  SpielwieseMessageSectionBodyProps,
  "header" | "nodeId" | "onPromptSectionChange" | "section"
>) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div className={cn("pt-[9px] pb-0.5 text-base", toneClassNames.body)}>
      <div
        className={cn(
          spielwieseMessageFieldShellClassName,
          header && "min-h-0 flex-col items-stretch px-0 py-0 shadow-none",
        )}
      >
        <EmbeddedMessageSectionHeader header={header} />
        <StandardPromptTextarea
          className={cn(header && "px-3 pt-0 pb-1")}
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          section={section}
        />
      </div>
    </div>
  );
}

export function SpielwieseMessageSectionBody({
  header,
  nodeId,
  onPromptSectionChange,
  section,
  toolOptions,
}: SpielwieseMessageSectionBodyProps) {
  const messageKind = getMessageKind(section.id);
  const toneClassNames = getMessageToneClassNames(section.id);

  if (messageKind === "tool") {
    return (
      <div className={cn("pt-1 text-base", toneClassNames.body)}>
        <SpielwieseToolMessageSection
          nodeId={nodeId}
          onToolChange={(value) =>
            onPromptSectionChange(nodeId, section.id, value)
          }
          sectionLabel={section.label}
          toolOptions={toolOptions}
          toolValue={section.value}
        />
      </div>
    );
  }

  if (messageKind === "system") {
    return (
      <SpielwieseSystemMessageSectionBody
        header={header}
        nodeId={nodeId}
        onPromptSectionChange={onPromptSectionChange}
        section={section}
      />
    );
  }

  return (
    <SpielwieseDefaultMessageSectionBody
      header={header}
      nodeId={nodeId}
      onPromptSectionChange={onPromptSectionChange}
      section={section}
    />
  );
}
