import { Check, MoveDown, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { getSpielwieseToneStyles } from "./spielwieseToneStyles";
import {
  getSpielwieseDetectedVariableLabels,
  getSpielwieseNodeVariableLabels,
} from "./spielwieseMustacheVariables";
import { useSpielwieseVariableValues } from "./useSpielwieseVariableValues";

type SpielwieseAgentNodeHandoffConnectorProps = {
  priorNodes?: SpielwieseAgentNodeVM[];
  sourceNode: SpielwieseAgentNodeVM;
  targetNode: SpielwieseAgentNodeVM;
};

type HandoffTagState = {
  id: string;
  isEmpty: boolean;
  isPassed: boolean;
  label: string;
};

type HandoffTagToneStyle = {
  checkColor: string;
  chip: CSSProperties;
};

function getHandoffTags({
  priorNodes = [],
  sourceNode,
  targetNode,
  variableValues,
}: SpielwieseAgentNodeHandoffConnectorProps & {
  variableValues: Record<string, string>;
}): HandoffTagState[] {
  const priorTags = new Set(getSpielwieseDetectedVariableLabels(priorNodes));
  const sourceTags = getSpielwieseNodeVariableLabels(sourceNode).filter(
    (label) => !priorTags.has(label),
  );
  const targetTags = new Set(getSpielwieseNodeVariableLabels(targetNode));

  return sourceTags.map((label) => ({
    id: `${sourceNode.id}-${targetNode.id}-${label}`,
    isEmpty: !(variableValues[label] ?? "").trim(),
    isPassed: targetTags.has(label),
    label,
  }));
}

function getHandoffTagToneStyle(tagIndex: number): HandoffTagToneStyle {
  const toneStyles = getSpielwieseToneStyles(tagIndex);

  return {
    checkColor: toneStyles.accent,
    chip: {
      backgroundColor: toneStyles.fill,
      boxShadow: `inset 0 0 0 1px ${toneStyles.accent}`,
      color: toneStyles.accent,
    },
  };
}

function HandoffTag({
  isEmpty,
  isPassed,
  label,
  tagIndex,
}: {
  isEmpty: boolean;
  isPassed: boolean;
  label: string;
  tagIndex: number;
}) {
  const toneStyle = getHandoffTagToneStyle(tagIndex);
  const showsCheck = isPassed && !isEmpty;
  const showsEmpty = isEmpty;

  return (
    <div
      className={cn(
        "inline-flex h-6 max-w-full min-w-0 shrink-0 items-center gap-1 rounded-[9px] border px-2 text-[0.6875rem] leading-3.5 font-medium tracking-[-0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]",
        isPassed
          ? "border-transparent"
          : "text-foreground/38 border-[rgba(15,23,42,0.06)] bg-[rgba(250,250,249,0.94)] shadow-none",
      )}
      data-empty={isEmpty ? "true" : "false"}
      data-state={isPassed ? "passed" : "pending"}
      data-testid="spielwiese-agent-node-connector-tag"
      style={isPassed ? toneStyle.chip : undefined}
    >
      <span className="min-w-0 truncate">{label}</span>
      {showsEmpty ? (
        <div
          className="text-foreground/48 inline-flex h-3.5 shrink-0 items-center rounded-[6px] border border-[rgba(15,23,42,0.06)] bg-white/84 px-1.5 text-[0.5625rem] leading-none font-semibold tracking-[0.02em] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
          data-testid="spielwiese-agent-node-connector-tag-empty"
        >
          empty
        </div>
      ) : null}
      {showsCheck ? (
        <div
          className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-[6px] border border-[rgba(0,0,0,0.05)] bg-white/92 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          data-testid="spielwiese-agent-node-connector-tag-check"
          style={{ color: toneStyle.checkColor }}
        >
          <Check className="size-2.25 stroke-[2.3px]" />
        </div>
      ) : null}
    </div>
  );
}

export function SpielwieseAgentNodeHandoffConnector({
  priorNodes,
  sourceNode,
  targetNode,
}: SpielwieseAgentNodeHandoffConnectorProps) {
  const variableValues = useSpielwieseVariableValues();
  const handoffTags = getHandoffTags({
    priorNodes,
    sourceNode,
    targetNode,
    variableValues,
  });
  const ArrowIcon: LucideIcon = MoveDown;

  return (
    <li
      className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5"
      data-testid="spielwiese-agent-node-connector"
    >
      <div aria-hidden="true" />
      <div
        className="text-foreground/42 inline-flex size-4 shrink-0 items-center justify-center rounded-[7px] border border-[color:var(--spielwiese-agent-node-chrome-border)] bg-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
        data-testid="spielwiese-agent-node-connector-arrow"
      >
        <ArrowIcon className="size-2.25 stroke-[2.1px]" />
      </div>
      {handoffTags.length > 0 ? (
        <div
          className="flex min-h-7 min-w-0 flex-wrap items-center justify-start gap-1"
          data-testid="spielwiese-agent-node-connector-tag-strip"
        >
          {handoffTags.map((tag, index) => (
            <HandoffTag
              isEmpty={tag.isEmpty}
              isPassed={tag.isPassed}
              key={tag.id}
              label={tag.label}
              tagIndex={index}
            />
          ))}
        </div>
      ) : (
        <div />
      )}
    </li>
  );
}
