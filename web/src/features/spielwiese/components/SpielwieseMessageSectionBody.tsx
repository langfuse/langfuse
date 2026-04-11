import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import { SpielwieseJsonFormatComposer } from "./SpielwieseJsonFormatComposer";
import { SpielwieseMustacheTextarea } from "./SpielwieseMustacheTextarea";
import {
  SpielwieseToolMessageSection,
  type SpielwieseToolOption,
} from "./SpielwieseToolMessageSection";

export const spielwieseInlineTextareaClassName =
  "h-full rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";
export const spielwieseMessageFieldShellClassName =
  "flex min-h-9 w-full min-w-0 items-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.05)] bg-white px-3 py-1 shadow-[0_0_0_3px_rgba(0,0,0,0.03)]";
export const spielwieseSingleLineTextareaClassName = `${spielwieseInlineTextareaClassName} [field-sizing:content] min-h-6 w-full overflow-hidden rounded-[10px] bg-transparent text-base leading-7 sm:text-[0.9375rem]`;

type SpielwieseMessageSectionBodyProps = {
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

function StandardPromptTextarea({
  className,
  nodeId,
  onPromptSectionChange,
  section,
}: Pick<
  SpielwieseMessageSectionBodyProps,
  "nodeId" | "onPromptSectionChange" | "section"
> & {
  className?: string;
}) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <SpielwieseMustacheTextarea
      aria-label={`${nodeId} ${section.label}`}
      className={cn(
        spielwieseSingleLineTextareaClassName,
        toneClassNames.field,
        className,
      )}
      name={`${nodeId}-${section.id}`}
      onChange={(event) =>
        onPromptSectionChange(nodeId, section.id, event.target.value)
      }
      placeholder={getPromptSectionPlaceholder(section)}
      rows={1}
      value={section.value}
    />
  );
}

function SpielwieseSystemMessageSectionBody({
  nodeId,
  onPromptSectionChange,
  section,
}: Pick<
  SpielwieseMessageSectionBodyProps,
  "nodeId" | "onPromptSectionChange" | "section"
>) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div className={cn("pt-[17px] pb-0.5 text-base", toneClassNames.body)}>
      <div
        className={cn(
          spielwieseMessageFieldShellClassName,
          "min-h-0 flex-col items-stretch bg-[#F1F2F2] px-0 py-0",
        )}
      >
        <StandardPromptTextarea
          className="bg-[#FBFBFB] px-3 py-1 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          section={section}
        />
        <SpielwieseJsonFormatComposer
          nodeId={nodeId}
          sectionLabel={section.label}
        />
      </div>
    </div>
  );
}

function SpielwieseDefaultMessageSectionBody({
  nodeId,
  onPromptSectionChange,
  section,
}: Pick<
  SpielwieseMessageSectionBodyProps,
  "nodeId" | "onPromptSectionChange" | "section"
>) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div className={cn("pt-[17px] pb-0.5 text-base", toneClassNames.body)}>
      <div className={spielwieseMessageFieldShellClassName}>
        <StandardPromptTextarea
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          section={section}
        />
      </div>
    </div>
  );
}

export function SpielwieseMessageSectionBody({
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
        nodeId={nodeId}
        onPromptSectionChange={onPromptSectionChange}
        section={section}
      />
    );
  }

  return (
    <SpielwieseDefaultMessageSectionBody
      nodeId={nodeId}
      onPromptSectionChange={onPromptSectionChange}
      section={section}
    />
  );
}
