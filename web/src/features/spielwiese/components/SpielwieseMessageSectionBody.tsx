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

export const spielwieseInlineTextareaClassName =
  "h-full rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";
export const spielwieseMessageFieldShellClassName =
  "flex min-h-9 w-full min-w-0 items-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.05)] bg-white px-3 py-1 shadow-[0_0_0_3px_rgba(0,0,0,0.03)]";
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
) {
  const messageKind = getMessageKind(section.id);

  if (messageKind === "system") {
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

  return (
    <SpielwieseMustacheTextarea
      aria-label={`${nodeId} ${section.label}`}
      className={cn(toneClassNames.field, textareaClassName, className)}
      name={`${nodeId}-${section.id}`}
      onChange={(event) =>
        onPromptSectionChange(nodeId, section.id, event.target.value)
      }
      placeholder={getPromptSectionPlaceholder(section)}
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
    <div className={cn("pt-0 pb-px text-base", toneClassNames.body)}>
      <div
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden border border-[rgba(0,0,0,0.05)] bg-[#F1F2F2] px-[2px] pt-0 pb-[2px] shadow-none",
          spielwieseEmbeddedPromptRadiusVariablesClassName,
          spielwieseEmbeddedPromptRadiusClassName,
          shouldRenderEmbeddedHeader && "gap-px shadow-none",
        )}
      >
        {header}
        <div
          className={cn(
            "flex min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden bg-[#FBFBFB] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
            spielwieseEmbeddedPromptInnerRadiusClassName,
          )}
          data-testid="spielwiese-system-message-prompt-shell"
        >
          <StandardPromptTextarea
            className="bg-transparent px-3 py-1 shadow-none"
            nodeId={nodeId}
            onPromptSectionChange={onPromptSectionChange}
            rootClassName={spielwieseEmbeddedPromptInnerRadiusClassName}
            section={section}
            textareaClassName={spielwieseEmbeddedSingleLineTextareaClassName}
          />
        </div>
      </div>
    </div>
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
