import { useId } from "react";

import styles from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/gatewaySetupHero.module.css";
import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";

export type GatewaySetupSwitchboardProps = {
  providers: Array<{ provider: GatewayProvider; isConnected: boolean }>;
  /** Up to four client labels drawn on the incoming lines that carry traffic. */
  sources?: ReadonlyArray<string>;
  /** When set, no traffic flows and the hub carries this label, e.g. "Not set up". */
  idleLabel?: string;
  /** How providers without a credential render: an off switch, or an empty dashed slot. */
  unconnectedVariant?: "switch" | "placeholder";
  /** A dimmed placeholder row after the providers, e.g. "More soon". */
  comingSoonLabel?: string;
};

const SOURCE_PILL = { x: 10, height: 18, charWidth: 6.2, padding: 14 };

function idleLabelWidth(label: string) {
  return label.length * SOURCE_PILL.charWidth + SOURCE_PILL.padding;
}

const VIEWBOX_HEIGHT = 200;
const HUB = { x: 220, y: VIEWBOX_HEIGHT / 2 };
const HUB_RADIUS = 20;
const FAN_END_X = HUB.x - HUB_RADIUS;
const PILL = { x: 282, width: 150, height: 26, spacing: 36 };
const TOGGLE_X = PILL.x + PILL.width - 28;
/** Placeholder pills carry no switch, so they only need room for the label. */
const PLACEHOLDER_PILL_WIDTH = 116;

const FAN = Array.from({ length: 9 }, (_, index) => {
  const y = 12 + index * 22;
  const bend = HUB.y + (y - HUB.y) * 0.12;
  return `M0 ${y}C96 ${y},150 ${bend},${FAN_END_X} ${HUB.y}`;
});

/** Delays spread the dots; the offsets are where they rest without motion. */
const TRAFFIC = [
  { line: 1, className: undefined, restOffset: -22 },
  { line: 3, className: styles.trafficDelay1, restOffset: -48 },
  { line: 5, className: styles.trafficDelay2, restOffset: -70 },
  { line: 7, className: styles.trafficDelay3, restOffset: -34 },
];

function connectorPath(y: number) {
  return `M${HUB.x + HUB_RADIUS} ${HUB.y}C262 ${HUB.y},262 ${y},${PILL.x} ${y}`;
}

/** Short enough to leave room for the switch in a pill. */
const DIAGRAM_LABELS = {
  ...providerLabels,
  BEDROCK: "Bedrock",
  VERCEL: "Vercel",
  AZURE: "Azure",
  GOOGLE_AI_STUDIO: "Google AI",
  VERTEX: "Vertex AI",
} satisfies Record<GatewayProvider, string>;

const iconSrc = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

/** Illustration: traffic flows into Langfuse and on to every connected provider. */
export function GatewaySetupSwitchboard({
  providers,
  sources = [],
  idleLabel,
  unconnectedVariant = "switch",
  comingSoonLabel,
}: GatewaySetupSwitchboardProps) {
  const gradientId = useId();
  const placeholderWidth =
    unconnectedVariant === "placeholder" ? PLACEHOLDER_PILL_WIDTH : PILL.width;
  const isIdle = idleLabel !== undefined;
  const rowCount = providers.length + (comingSoonLabel === undefined ? 0 : 1);
  // Tighter rows keep the outer pills inside the 200-high viewBox.
  const spacing = Math.min(
    PILL.spacing,
    (VIEWBOX_HEIGHT - PILL.height - 2) / Math.max(rowCount - 1, 1),
  );
  // Pills shrink with the rows so neighbours keep a gap.
  const pillHeight = Math.min(PILL.height, spacing - 2);
  const rowY = (index: number) =>
    HUB.y + (index - (rowCount - 1) / 2) * spacing;

  return (
    <svg
      viewBox={`0 0 440 ${VIEWBOX_HEIGHT}`}
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={FAN_END_X}
          y2={0}
        >
          <stop
            offset={0}
            stopOpacity={0.06}
            style={{ stopColor: "hsl(var(--foreground))" }}
          />
          <stop
            offset={1}
            stopOpacity={0.5}
            style={{ stopColor: "hsl(var(--foreground))" }}
          />
        </linearGradient>
      </defs>
      {FAN.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={1.1}
          strokeDasharray={isIdle ? "2 3" : undefined}
          strokeLinecap="round"
        />
      ))}
      {(isIdle ? [] : TRAFFIC).map(({ line, className, restOffset }) => (
        <path
          key={line}
          d={FAN[line]}
          pathLength={100}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDashoffset={restOffset}
          className={cn("stroke-foreground", styles.traffic, className)}
        />
      ))}
      {TRAFFIC.map(({ line }, index) => {
        const source = sources[index];
        if (source === undefined) return null;
        const y = 12 + line * 22;
        const width =
          source.length * SOURCE_PILL.charWidth + SOURCE_PILL.padding;
        return (
          <g key={source}>
            <rect
              x={SOURCE_PILL.x}
              y={y - SOURCE_PILL.height / 2}
              width={width}
              height={SOURCE_PILL.height}
              rx={3}
              className="fill-background stroke-border"
            />
            <text
              x={SOURCE_PILL.x + SOURCE_PILL.padding / 2}
              y={y + 3.4}
              fontSize={10}
              className="fill-foreground font-mono"
            >
              {source}
            </text>
          </g>
        );
      })}
      {providers.map(({ provider, isConnected }, index) => {
        const y = rowY(index);
        const connector = connectorPath(y);
        const Icon = providerIcons[provider];
        const isPlaceholder =
          unconnectedVariant === "placeholder" && !isConnected;
        return (
          <g key={provider}>
            <path
              d={connector}
              fill="none"
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeDasharray={isConnected ? undefined : "3 4"}
              className={cn(
                styles.connector,
                isConnected ? "stroke-foreground" : "stroke-muted-foreground",
              )}
            />
            {isConnected && !isIdle ? (
              <path
                d={connector}
                pathLength={100}
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDashoffset={-50}
                className={cn(
                  "stroke-foreground",
                  styles.traffic,
                  styles.trafficDelay2,
                )}
              />
            ) : null}
            <rect
              x={PILL.x}
              y={y - pillHeight / 2}
              width={isPlaceholder ? placeholderWidth : PILL.width}
              height={pillHeight}
              rx={4}
              strokeDasharray={isPlaceholder ? "3 3" : undefined}
              className={cn(
                "fill-background",
                isPlaceholder ? "stroke-muted-foreground" : "stroke-border",
              )}
            />
            <Icon
              size="sm"
              color={isConnected ? "foreground" : "muted"}
              x={PILL.x + 8}
              y={y - 6}
            />
            <text
              x={PILL.x + 25}
              y={y + 3.8}
              fontSize={11}
              className={cn(
                "font-mono",
                isConnected ? "fill-foreground" : "fill-muted-foreground",
              )}
            >
              {DIAGRAM_LABELS[provider]}
            </text>
            {isPlaceholder ? null : (
              <>
                <rect
                  x={TOGGLE_X}
                  y={y - 5.6}
                  width={19.6}
                  height={11.2}
                  rx={5.6}
                  className={cn(
                    styles.track,
                    isConnected ? "fill-foreground" : "fill-border",
                  )}
                />
                <circle
                  cx={TOGGLE_X + 5.6}
                  cy={y}
                  r={4.2}
                  className={cn(
                    "fill-surface-section",
                    styles.knob,
                    isConnected && styles.knobOn,
                  )}
                />
              </>
            )}
          </g>
        );
      })}
      {comingSoonLabel === undefined ? null : (
        <g>
          <path
            d={connectorPath(rowY(providers.length))}
            fill="none"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeDasharray="3 4"
            className="stroke-border"
          />
          <rect
            x={PILL.x}
            y={rowY(providers.length) - pillHeight / 2}
            width={placeholderWidth}
            height={pillHeight}
            rx={4}
            strokeDasharray="3 3"
            className="fill-background stroke-border"
          />
          <text
            x={PILL.x + 8}
            y={rowY(providers.length) + 3.8}
            fontSize={11}
            className="fill-muted-foreground font-mono opacity-60"
          >
            {comingSoonLabel}
          </text>
        </g>
      )}
      <circle
        cx={HUB.x}
        cy={HUB.y}
        r={HUB_RADIUS}
        className="fill-surface-section"
      />
      <image
        href={iconSrc}
        x={HUB.x - HUB_RADIUS}
        y={HUB.y - HUB_RADIUS}
        width={HUB_RADIUS * 2}
        height={HUB_RADIUS * 2}
      />
      {isIdle ? (
        <g>
          <rect
            x={HUB.x - idleLabelWidth(idleLabel) / 2}
            y={HUB.y + HUB_RADIUS + 4}
            width={idleLabelWidth(idleLabel)}
            height={SOURCE_PILL.height}
            rx={3}
            className="fill-background stroke-border"
          />
          <text
            x={HUB.x}
            y={HUB.y + HUB_RADIUS + 4 + SOURCE_PILL.height / 2 + 3.4}
            fontSize={10}
            textAnchor="middle"
            className="fill-muted-foreground font-mono"
          >
            {idleLabel}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
