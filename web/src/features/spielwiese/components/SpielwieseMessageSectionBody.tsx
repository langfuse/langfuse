import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Textarea } from "../ui/textarea";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import {
  SpielwieseToolMessageSection,
  type SpielwieseToolOption,
} from "./SpielwieseToolMessageSection";

export const spielwieseInlineTextareaClassName =
  "h-full rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";

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

export function SpielwieseMessageSectionBody({
  nodeId,
  onPromptSectionChange,
  section,
  toolOptions,
}: SpielwieseMessageSectionBodyProps) {
  const toneClassNames = getMessageToneClassNames(section.id);
  const messageKind = getMessageKind(section.id);

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

  return (
    <div className={cn("pt-1 pb-0.5 text-base", toneClassNames.body)}>
      <Textarea
        aria-label={`${nodeId} ${section.label}`}
        className={cn(
          `${spielwieseInlineTextareaClassName} [field-sizing:content] min-h-6 overflow-hidden text-base leading-7 sm:text-[0.9375rem]`,
          toneClassNames.field,
        )}
        name={`${nodeId}-${section.id}`}
        onChange={(event) =>
          onPromptSectionChange(nodeId, section.id, event.target.value)
        }
        placeholder={getPromptSectionPlaceholder(section)}
        rows={1}
        value={section.value}
      />
    </div>
  );
}
