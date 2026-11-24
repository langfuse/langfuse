import { useId } from "react";

import { providerColorIcons } from "@/src/features/ai-gateway/constants/providerColorIcons";
import { providerShortLabels } from "@/src/features/ai-gateway/constants/providerShortLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";

import styles from "./gatewayFanOutDiagram.module.css";

export type GatewayFanOutDiagramProps = {
  /** Client names drawn as chips on the left. With none, bare lines fan in from the left edge. */
  sources: ReadonlyArray<string>;
};

const HEIGHT = 320;
const HUB = { y: HEIGHT / 2, size: 42 };
const SOURCE_CHIP = { x: 120, width: 136, height: 32, spacing: 64 };
const PROVIDER_PILL = { width: 156, height: 36, spacing: 48 };
const MORE_ROW = { avatar: 32, step: 24 };
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

/** Horizontal positions. The layout with client chips is wider to make room for them. */
const LAYOUTS = {
  chips: {
    width: 960,
    hubX: 480,
    hubGap: 24,
    pillX: 704,
    moreX: 698,
    bend: [604, 616],
  },
  lines: {
    width: 560,
    hubX: 280,
    hubGap: 21,
    pillX: 380,
    moreX: 376,
    bend: [344, 348],
  },
} as const;

type Layout = (typeof LAYOUTS)[keyof typeof LAYOUTS];

/** Rows of the fan that comes in from the left edge; every other one carries a dot. */
const FAN_ROWS = [16, 56, 96, 136, 184, 224, 264, 304];
const BACKDROP_ROWS = [16, 96, 224, 304];

function rowY(index: number, count: number, spacing: number) {
  return HUB.y + (index - (count - 1) / 2) * spacing;
}

const iconSrc = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

function Traffic({ d, delay }: { d: string; delay: number }) {
  return (
    <path
      d={d}
      pathLength={100}
      strokeWidth={2.5}
      strokeLinecap="round"
      className={cn("stroke-muted-foreground", styles.pulse)}
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

function IncomingFan({ fanInX }: { fanInX: number }) {
  const gradientId = useId();
  const line = (y: number) =>
    `M0 ${y}C150 ${y} 200 ${HUB.y} ${fanInX} ${HUB.y}`;

  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={fanInX}
          y2={0}
        >
          {[
            [0, 0],
            [0.55, 0.55],
            [1, 0.9],
          ].map(([offset, opacity]) => (
            <stop
              key={offset}
              offset={offset}
              stopOpacity={opacity}
              style={{ stopColor: "hsl(var(--foreground-tertiary))" }}
            />
          ))}
        </linearGradient>
      </defs>
      {FAN_ROWS.map((y) => (
        <path
          key={y}
          d={line(y)}
          stroke={`url(#${gradientId})`}
          strokeWidth={1.25}
        />
      ))}
      {FAN_ROWS.filter((_, index) => index % 2 === 1).map((y, index) => (
        <Traffic key={y} d={line(y)} delay={index * -1.1} />
      ))}
    </>
  );
}

function SourceChips({
  sources,
  fanInX,
}: {
  sources: ReadonlyArray<string>;
  fanInX: number;
}) {
  const gradientId = useId();
  const chipEdge = SOURCE_CHIP.x + SOURCE_CHIP.width;
  const line = (y: number) =>
    `M${chipEdge} ${y}C356 ${y} 364 ${HUB.y} ${fanInX} ${HUB.y}`;

  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={fanInX}
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
      {BACKDROP_ROWS.map((y) => (
        <path
          key={y}
          d={`M0 ${y}C240 ${y} 340 ${HUB.y} ${fanInX} ${HUB.y}`}
          stroke={`url(#${gradientId})`}
          strokeWidth={1}
        />
      ))}
      {sources.map((source, index) => {
        const y = rowY(index, sources.length, SOURCE_CHIP.spacing);
        return (
          <g key={source}>
            <path
              d={line(y)}
              strokeWidth={1.25}
              className="stroke-foreground-tertiary"
            />
            <Traffic d={line(y)} delay={index * -0.8} />
            <rect
              x={SOURCE_CHIP.x}
              y={y - SOURCE_CHIP.height / 2}
              width={SOURCE_CHIP.width}
              height={SOURCE_CHIP.height}
              rx={6}
              className={cn("fill-popover", styles.chip)}
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
        );
      })}
    </>
  );
}

function ProviderPills({ layout }: { layout: Layout }) {
  const rowCount = PILL_PROVIDERS.length + 1;
  const moreY = rowY(PILL_PROVIDERS.length, rowCount, PROVIDER_PILL.spacing);
  const line = (y: number, endX: number) =>
    `M${layout.hubX + layout.hubGap} ${HUB.y}C${layout.bend[0]} ${HUB.y} ${layout.bend[1]} ${y} ${endX} ${y}`;

  return (
    <>
      {PILL_PROVIDERS.map((provider, index) => {
        const y = rowY(index, rowCount, PROVIDER_PILL.spacing);
        const Logo = providerColorIcons[provider];
        return (
          <g key={provider}>
            <path
              d={line(y, layout.pillX)}
              strokeWidth={1.25}
              strokeDasharray="3 4"
              className="stroke-foreground-tertiary opacity-70"
            />
            <rect
              x={layout.pillX}
              y={y - PROVIDER_PILL.height / 2}
              width={PROVIDER_PILL.width}
              height={PROVIDER_PILL.height}
              rx={6}
              className={cn("fill-popover", styles.chip)}
            />
            <Logo size="lg" x={layout.pillX + 12} y={y - ICON.lg / 2} />
            <text
              x={layout.pillX + 12 + ICON.lg + 10}
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
          d={line(moreY, layout.moreX)}
          strokeWidth={1.25}
          strokeDasharray="3 4"
          className="stroke-foreground-tertiary opacity-40"
        />
        {MORE_PROVIDERS.map((provider, index) => {
          const centerX =
            layout.moreX + MORE_ROW.avatar / 2 + index * MORE_ROW.step;
          const Logo = providerColorIcons[provider];
          return (
            <g key={provider}>
              <circle
                cx={centerX}
                cy={moreY}
                r={MORE_ROW.avatar / 2}
                className={cn("fill-popover", styles.chip)}
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
            layout.moreX +
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
    </>
  );
}

export function GatewayFanOutDiagram({ sources }: GatewayFanOutDiagramProps) {
  const layout = sources.length > 0 ? LAYOUTS.chips : LAYOUTS.lines;
  const fanInX = layout.hubX - layout.hubGap;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${HEIGHT}`}
      fill="none"
      aria-hidden="true"
      className="text-foreground block h-auto w-full overflow-visible"
    >
      {sources.length > 0 ? (
        <SourceChips sources={sources} fanInX={fanInX} />
      ) : (
        <IncomingFan fanInX={fanInX} />
      )}
      <ProviderPills layout={layout} />
      <image
        href={iconSrc}
        x={layout.hubX - HUB.size / 2}
        y={HUB.y - HUB.size / 2}
        width={HUB.size}
        height={HUB.size}
      />
    </svg>
  );
}
