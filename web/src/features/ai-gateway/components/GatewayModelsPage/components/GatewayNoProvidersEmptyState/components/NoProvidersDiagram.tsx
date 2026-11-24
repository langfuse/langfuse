import { useId } from "react";

import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";
import { providerColorIcons } from "@/src/features/ai-gateway/constants/providerColorIcons";
import { providerShortLabels } from "@/src/features/ai-gateway/constants/providerShortLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";

import styles from "./noProvidersDiagram.module.css";

const VIEWBOX = { width: 960, height: 320 };
const HUB = { x: 480, y: 160, size: 42 };
const FAN_IN_X = HUB.x - 24;
const FAN_OUT_X = HUB.x + 24;

const SOURCE_CHIP = { x: 120, width: 136, height: 36, spacing: 64 };
const PROVIDER_PILL = { x: 704, width: 156, height: 40, spacing: 48 };
const MORE_ROW = { x: 698, avatar: 32, step: 24 };
const FONT_SIZE = 13;
/** Icon scale sizes used inside the SVG, in px. */
const ICON = { lg: 20, base: 14 };

/** The providers drawn as named pills; the rest collapse into "and more". */
const PILL_PROVIDERS: GatewayProvider[] = [
  "ANTHROPIC",
  "OPENAI",
  "GOOGLE_AI_STUDIO",
  "BEDROCK",
  "AZURE",
];
const MORE_PROVIDERS: GatewayProvider[] = [
  "OPENROUTER",
  "XAI",
  "VERCEL",
  "VERTEX",
];

const BACKDROP_LINES = [16, 96, 224, 304].map(
  (y) => `M0 ${y}C240 ${y} 340 ${HUB.y} ${FAN_IN_X} ${HUB.y}`,
);

function rowY(index: number, count: number, spacing: number) {
  return HUB.y + (index - (count - 1) / 2) * spacing;
}

function sourceLine(y: number) {
  return `M${SOURCE_CHIP.x + SOURCE_CHIP.width} ${y}C356 ${y} 364 ${HUB.y} ${FAN_IN_X} ${HUB.y}`;
}

function providerLine(y: number, endX: number) {
  return `M${FAN_OUT_X} ${HUB.y}C604 ${HUB.y} 616 ${y} ${endX} ${y}`;
}

const iconSrc = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

export function NoProvidersDiagram() {
  const gradientId = useId();
  const rowCount = PILL_PROVIDERS.length + 1;
  const moreY = rowY(PILL_PROVIDERS.length, rowCount, PROVIDER_PILL.spacing);
  const sourceRows = GATEWAY_TRAFFIC_SOURCES.map((source, index) => ({
    source,
    y: rowY(index, GATEWAY_TRAFFIC_SOURCES.length, SOURCE_CHIP.spacing),
  }));

  return (
    <div
      aria-hidden="true"
      className={cn("bg-muted w-full rounded-xl px-6 py-5", styles.dotGrid)}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        fill="none"
        className="text-foreground block h-auto w-full overflow-visible"
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={FAN_IN_X}
            y2={0}
          >
            <stop
              offset={0}
              stopOpacity={0}
              style={{ stopColor: "hsl(var(--foreground-tertiary))" }}
            />
            <stop
              offset={1}
              stopOpacity={0.3}
              style={{ stopColor: "hsl(var(--foreground-tertiary))" }}
            />
          </linearGradient>
        </defs>
        {BACKDROP_LINES.map((d) => (
          <path key={d} d={d} stroke={`url(#${gradientId})`} strokeWidth={1} />
        ))}
        {sourceRows.map(({ source, y }, index) => (
          <g key={source}>
            <path
              d={sourceLine(y)}
              strokeWidth={1.25}
              className="stroke-foreground-tertiary"
            />
            <path
              d={sourceLine(y)}
              pathLength={100}
              strokeWidth={2.5}
              strokeLinecap="round"
              className={cn("stroke-muted-foreground", styles.pulse)}
              style={{ animationDelay: `${index * -0.8}s` }}
            />
            <rect
              x={SOURCE_CHIP.x}
              y={y - SOURCE_CHIP.height / 2}
              width={SOURCE_CHIP.width}
              height={SOURCE_CHIP.height}
              rx={6}
              className={cn("fill-card", styles.chip)}
            />
            <text
              x={SOURCE_CHIP.x + 12}
              y={y}
              dominantBaseline="central"
              fontSize={FONT_SIZE}
              className="fill-foreground-secondary font-mono"
            >
              {source}
            </text>
          </g>
        ))}
        {PILL_PROVIDERS.map((provider, index) => {
          const y = rowY(index, rowCount, PROVIDER_PILL.spacing);
          const Logo = providerColorIcons[provider];
          return (
            <g key={provider}>
              <path
                d={providerLine(y, PROVIDER_PILL.x)}
                strokeWidth={1.25}
                strokeDasharray="3 4"
                className="stroke-foreground-tertiary opacity-70"
              />
              <rect
                x={PROVIDER_PILL.x}
                y={y - PROVIDER_PILL.height / 2}
                width={PROVIDER_PILL.width}
                height={PROVIDER_PILL.height}
                rx={6}
                className={cn("fill-card", styles.chip)}
              />
              <Logo size="lg" x={PROVIDER_PILL.x + 12} y={y - ICON.lg / 2} />
              <text
                x={PROVIDER_PILL.x + 12 + ICON.lg + 10}
                y={y}
                dominantBaseline="central"
                fontSize={FONT_SIZE}
                className="fill-foreground-secondary font-mono"
              >
                {providerShortLabels[provider]}
              </text>
            </g>
          );
        })}
        <g className="text-foreground-secondary">
          <path
            d={providerLine(moreY, MORE_ROW.x)}
            strokeWidth={1.25}
            strokeDasharray="3 4"
            className="stroke-foreground-tertiary opacity-40"
          />
          {MORE_PROVIDERS.map((provider, index) => {
            const centerX =
              MORE_ROW.x + MORE_ROW.avatar / 2 + index * MORE_ROW.step;
            const Logo = providerColorIcons[provider];
            return (
              <g key={provider}>
                <circle
                  cx={centerX}
                  cy={moreY}
                  r={MORE_ROW.avatar / 2}
                  className={cn("fill-card", styles.chip)}
                />
                <Logo
                  size="base"
                  x={centerX - ICON.base / 2}
                  y={moreY - ICON.base / 2}
                />
              </g>
            );
          })}
          <text
            x={
              MORE_ROW.x +
              MORE_ROW.avatar +
              (MORE_PROVIDERS.length - 1) * MORE_ROW.step +
              12
            }
            y={moreY}
            dominantBaseline="central"
            fontSize={FONT_SIZE}
            className="fill-foreground-secondary font-mono"
          >
            and more
          </text>
        </g>
        <image
          href={iconSrc}
          x={HUB.x - HUB.size / 2}
          y={HUB.y - HUB.size / 2}
          width={HUB.size}
          height={HUB.size}
        />
      </svg>
    </div>
  );
}
