import { Check, MoveDown, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { MUSTACHE_REGEX, isValidVariableName } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { getSpielwieseToneStyles } from "./spielwieseToneStyles";

type SpielwieseAgentNodeHandoffConnectorProps = {
  sourceNode: SpielwieseAgentNodeVM;
  targetNode: SpielwieseAgentNodeVM;
};

type HandoffTagState = {
  id: string;
  isPassed: boolean;
  label: string;
};

type HandoffTagToneStyle = {
  checkColor: string;
  chip: CSSProperties;
};

function getSettingValue(node: SpielwieseAgentNodeVM, settingId: string) {
  return node.settings.find((setting) => setting.id === settingId)?.value ?? "";
}

function parseSettingTags(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

function getPromptVariableTags(node: SpielwieseAgentNodeVM) {
  const mustacheRegex = new RegExp(MUSTACHE_REGEX.source, "g");

  return [
    ...new Set(
      node.promptSections.flatMap((section) =>
        [...section.value.matchAll(mustacheRegex)]
          .map((match) => match[1] ?? "")
          .filter((variableName) => isValidVariableName(variableName)),
      ),
    ),
  ];
}

function getHandoffTags({
  sourceNode,
  targetNode,
}: SpielwieseAgentNodeHandoffConnectorProps): HandoffTagState[] {
  const sourceTags = parseSettingTags(getSettingValue(sourceNode, "output"));
  const targetTags = new Set([
    ...parseSettingTags(getSettingValue(targetNode, "input")),
    ...getPromptVariableTags(targetNode),
  ]);

  return sourceTags.map((label) => ({
    id: `${sourceNode.id}-${targetNode.id}-${label}`,
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
  isPassed,
  label,
  tagIndex,
}: {
  isPassed: boolean;
  label: string;
  tagIndex: number;
}) {
  const toneStyle = getHandoffTagToneStyle(tagIndex);

  return (
    <div
      className={cn(
        "inline-flex h-7 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-[10px] border px-1.5 pr-2 text-[12px] leading-4.5 font-medium tracking-[-0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]",
        isPassed
          ? "border-transparent"
          : "text-foreground/34 border-[rgba(0,0,0,0.05)] bg-[rgba(247,247,247,0.92)] shadow-none",
      )}
      data-state={isPassed ? "passed" : "pending"}
      data-testid="spielwiese-agent-node-connector-tag"
      style={isPassed ? toneStyle.chip : undefined}
    >
      {isPassed ? (
        <span
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          data-testid="spielwiese-agent-node-connector-tag-check"
          style={{ color: toneStyle.checkColor }}
        >
          <Check className="size-2.5 stroke-[2.3px]" />
        </span>
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

export function SpielwieseAgentNodeHandoffConnector({
  sourceNode,
  targetNode,
}: SpielwieseAgentNodeHandoffConnectorProps) {
  const handoffTags = getHandoffTags({ sourceNode, targetNode });
  const ArrowIcon: LucideIcon = MoveDown;

  return (
    <li
      className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5"
      data-testid="spielwiese-agent-node-connector"
    >
      <div aria-hidden="true" />
      <div
        className="bg-background text-foreground/46 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--spielwiese-agent-node-chrome-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_1px_2px_rgba(15,23,42,0.06)]"
        data-testid="spielwiese-agent-node-connector-arrow"
      >
        <ArrowIcon className="size-3.5 stroke-[2.15px]" />
      </div>
      {handoffTags.length > 0 ? (
        <div
          className="flex min-h-7 min-w-0 flex-wrap items-center justify-start gap-1"
          data-testid="spielwiese-agent-node-connector-tag-strip"
        >
          {handoffTags.map((tag, index) => (
            <HandoffTag
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
