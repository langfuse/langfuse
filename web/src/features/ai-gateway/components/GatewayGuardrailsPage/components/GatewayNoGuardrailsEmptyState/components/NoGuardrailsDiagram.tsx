import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";

import styles from "./noGuardrailsDiagram.module.css";

const VIEWBOX = { width: 960, height: 280 };
const CENTER_Y = VIEWBOX.height / 2;
const HUB = { x: 468, y: CENTER_Y, size: 42, gap: 26 };
const HUB_LEFT_X = HUB.x - HUB.gap;
const HUB_RIGHT_X = HUB.x + HUB.gap;

const PROMPT_CARD = {
  x: 48,
  width: 344,
  height: 70,
  rx: 6,
  paddingX: 18,
  labelOffsetY: -13,
  textOffsetY: 13,
  highlightX: 230,
  highlightWidth: 140,
  highlightHeight: 22,
};
const PROMPT_RIGHT_X = PROMPT_CARD.x + PROMPT_CARD.width;

const OUTCOME_CARD = {
  x: 572,
  width: 340,
  height: 40,
  spacing: 74,
  rx: 6,
  labelOffsetX: 16,
  valueOffsetX: 88,
};
const BEND_X = (HUB_RIGHT_X + OUTCOME_CARD.x) / 2;

const OUTCOMES = [
  { label: "Mask", value: "Send the contract to [EMAIL]" },
  { label: "Block", value: "403 guardrail_blocked" },
  { label: "Log only", value: "Flagged on the trace" },
] as const;

const FONT_SIZE = { label: 11, outcomeLabel: 12, mono: 13 };
const INCOMING_LINE = `M${PROMPT_RIGHT_X} ${CENTER_Y} L${HUB_LEFT_X} ${CENTER_Y}`;
const ICON_SRC = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

function rowY(index: number, count: number, spacing: number, centerY: number) {
  return centerY + (index - (count - 1) / 2) * spacing;
}

export function NoGuardrailsDiagram() {
  const promptTextY = CENTER_Y + PROMPT_CARD.textOffsetY;

  return (
    <GatewayPlaceholder.Diagram>
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        fill="none"
        aria-hidden="true"
        className="text-foreground block h-auto w-full overflow-visible"
      >
        <path
          d={INCOMING_LINE}
          strokeWidth={1.25}
          className="stroke-foreground-tertiary"
        />
        <path
          d={INCOMING_LINE}
          pathLength={100}
          strokeWidth={2.5}
          strokeLinecap="round"
          className={cn("stroke-muted-foreground", styles.pulse)}
        />

        <g>
          <rect
            x={PROMPT_CARD.x}
            y={CENTER_Y - PROMPT_CARD.height / 2}
            width={PROMPT_CARD.width}
            height={PROMPT_CARD.height}
            rx={PROMPT_CARD.rx}
            className={cn("fill-popover", styles.chip)}
          />
          <text
            x={PROMPT_CARD.x + PROMPT_CARD.paddingX}
            y={CENTER_Y + PROMPT_CARD.labelOffsetY}
            dominantBaseline="central"
            fontSize={FONT_SIZE.label}
            className="fill-muted-foreground"
          >
            Prompt
          </text>
          <text
            x={PROMPT_CARD.x + PROMPT_CARD.paddingX}
            y={promptTextY}
            dominantBaseline="central"
            fontSize={FONT_SIZE.mono}
            className="fill-foreground-secondary font-mono"
          >
            Send the contract to
          </text>
          <rect
            x={PROMPT_CARD.highlightX}
            y={promptTextY - PROMPT_CARD.highlightHeight / 2}
            width={PROMPT_CARD.highlightWidth}
            height={PROMPT_CARD.highlightHeight}
            rx={3}
            className="fill-yellow-200/80 dark:fill-yellow-500/35"
          />
          <text
            x={PROMPT_CARD.highlightX + PROMPT_CARD.highlightWidth / 2}
            y={promptTextY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={FONT_SIZE.mono}
            className="fill-foreground font-mono"
          >
            dana@example.com
          </text>
        </g>

        {OUTCOMES.map(({ label, value }, index) => {
          const y = rowY(
            index,
            OUTCOMES.length,
            OUTCOME_CARD.spacing,
            CENTER_Y,
          );
          const outgoingLine = `M${HUB_RIGHT_X} ${CENTER_Y}C${BEND_X} ${CENTER_Y} ${BEND_X} ${y} ${OUTCOME_CARD.x} ${y}`;

          return (
            <g key={label}>
              <path
                d={outgoingLine}
                strokeWidth={1.25}
                strokeDasharray="3 4"
                className="stroke-foreground-tertiary opacity-70"
              />
              <rect
                x={OUTCOME_CARD.x}
                y={y - OUTCOME_CARD.height / 2}
                width={OUTCOME_CARD.width}
                height={OUTCOME_CARD.height}
                rx={OUTCOME_CARD.rx}
                className={cn("fill-popover", styles.chip)}
              />
              <text
                x={OUTCOME_CARD.x + OUTCOME_CARD.labelOffsetX}
                y={y}
                dominantBaseline="central"
                fontSize={FONT_SIZE.outcomeLabel}
                className="fill-muted-foreground"
              >
                {label}
              </text>
              <text
                x={OUTCOME_CARD.x + OUTCOME_CARD.valueOffsetX}
                y={y}
                dominantBaseline="central"
                fontSize={FONT_SIZE.mono}
                className="fill-foreground-secondary font-mono"
              >
                {value}
              </text>
            </g>
          );
        })}

        <image
          href={ICON_SRC}
          x={HUB.x - HUB.size / 2}
          y={HUB.y - HUB.size / 2}
          width={HUB.size}
          height={HUB.size}
        />
      </svg>
    </GatewayPlaceholder.Diagram>
  );
}
