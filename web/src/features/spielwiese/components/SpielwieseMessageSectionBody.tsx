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

const inlineTextareaClassName =
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
      <div className={cn("text-base", toneClassNames.body)}>
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
    <div className={cn("px-2.5 pt-0.5 pb-2.5 text-base", toneClassNames.body)}>
      <Textarea
        aria-label={`${nodeId} ${section.label}`}
        className={cn(
          `${inlineTextareaClassName} [field-sizing:content] min-h-5 overflow-hidden text-[14px] leading-[20px]`,
          toneClassNames.field,
        )}
        name={`${nodeId}-${section.id}`}
        onChange={(event) =>
          onPromptSectionChange(nodeId, section.id, event.target.value)
        }
        rows={1}
        value={section.value}
      />
    </div>
  );
}
