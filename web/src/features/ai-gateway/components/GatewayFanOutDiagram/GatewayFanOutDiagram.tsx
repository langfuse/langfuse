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
  /** Shorter height for inline banners, collapsing extra providers into the bottom row. */
  density?: "default" | "compact";
};

const SOURCE_CHIP = { x: 120, width: 136, height: 32, spacing: 64 };
const FONT_SIZE = 13;

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
const COMPACT_PILL_PROVIDERS: GatewayProvider[] = PILL_PROVIDERS.slice(0, 2);
const COMPACT_MORE_PROVIDERS: GatewayProvider[] = [
  ...PILL_PROVIDERS.slice(2),
  ...MORE_PROVIDERS,
];

const DEFAULT_GEOMETRY = {
  height: 320,
  hubY: 160,
  hubSize: 42,
  pill: {
    width: 156,
    height: 36,
    spacing: 48,
    rx: 6,
    paddingX: 12,
    iconGap: 10,
    iconSize: "lg" as const,
    iconPx: 20,
    fontSize: FONT_SIZE,
  },
  more: {
    avatar: 32,
    step: 24,
    iconSize: "base" as const,
    iconPx: 14,
    labelGap: 12,
    fontSize: FONT_SIZE,
  },
  fanRows: [16, 56, 96, 136, 184, 224, 264, 304] as ReadonlyArray<number>,
  fanCurve: [150, 200] as readonly [number, number],
  lineStrokeWidth: 1.25,
  trafficStrokeWidth: 2.5,
  pillProviders: PILL_PROVIDERS,
  moreProviders: MORE_PROVIDERS,
};

const COMPACT_GEOMETRY = {
  height: 96,
  hubY: 48,
  hubSize: 24,
  pill: {
    width: 128,
    height: 22,
    spacing: 29,
    rx: 5,
    paddingX: 8,
    iconGap: 7,
    iconSize: "base" as const,
    iconPx: 14,
    fontSize: 11,
  },
  more: {
    avatar: 22,
    step: 18,
    iconSize: "sm" as const,
    iconPx: 12,
    labelGap: 8,
    fontSize: 10,
  },
  fanRows: [12, 26, 40, 56, 70, 84] as ReadonlyArray<number>,
  fanCurve: [44, 59] as readonly [number, number],
  lineStrokeWidth: 1.1,
  trafficStrokeWidth: 1.8,
  pillProviders: COMPACT_PILL_PROVIDERS,
  moreProviders: COMPACT_MORE_PROVIDERS,
};

/** Horizontal positions. The layout with client chips is wider to make room for them. */
const LAYOUTS = {
  chips: {
    ...DEFAULT_GEOMETRY,
    width: 960,
    hubX: 480,
    hubGap: 24,
    pillX: 704,
    moreX: 698,
    bend: [604, 616] as readonly [number, number],
  },
  lines: {
    ...DEFAULT_GEOMETRY,
    width: 560,
    hubX: 280,
    hubGap: 21,
    pillX: 380,
    moreX: 376,
    bend: [344, 348] as readonly [number, number],
  },
  compact: {
    ...COMPACT_GEOMETRY,
    width: 336,
    hubX: 92,
    hubGap: 16,
    pillX: 136,
    moreX: 134,
    bend: [122, 124] as readonly [number, number],
  },
};

type Layout = (typeof LAYOUTS)[keyof typeof LAYOUTS];

const BACKDROP_ROWS = [16, 96, 224, 304];

function rowY(index: number, count: number, spacing: number, centerY: number) {
  return centerY + (index - (count - 1) / 2) * spacing;
}

function selectLayout(
  density: NonNullable<GatewayFanOutDiagramProps["density"]>,
  hasSources: boolean,
) {
  if (density === "compact") return LAYOUTS.compact;
  return hasSources ? LAYOUTS.chips : LAYOUTS.lines;
}

const iconSrc = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

function Traffic({
  d,
  delay,
  strokeWidth = DEFAULT_GEOMETRY.trafficStrokeWidth,
}: {
  d: string;
  delay: number;
  strokeWidth?: number;
}) {
  return (
    <path
      d={d}
      pathLength={100}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      className={cn("stroke-muted-foreground", styles.pulse)}
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

function IncomingFan({ fanInX, layout }: { fanInX: number; layout: Layout }) {
  const gradientId = useId();
  const line = (y: number) =>
    `M0 ${y}C${layout.fanCurve[0]} ${y} ${layout.fanCurve[1]} ${layout.hubY} ${fanInX} ${layout.hubY}`;

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
      {layout.fanRows.map((y) => (
        <path
          key={y}
          d={line(y)}
          stroke={`url(#${gradientId})`}
          strokeWidth={layout.lineStrokeWidth}
        />
      ))}
      {layout.fanRows
        .filter((_, index) => index % 2 === 1)
        .map((y, index) => (
          <Traffic
            key={y}
            d={line(y)}
            delay={index * -1.1}
            strokeWidth={layout.trafficStrokeWidth}
          />
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
  const hubY = DEFAULT_GEOMETRY.hubY;
  const chipEdge = SOURCE_CHIP.x + SOURCE_CHIP.width;
  const line = (y: number) =>
    `M${chipEdge} ${y}C356 ${y} 364 ${hubY} ${fanInX} ${hubY}`;

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
          d={`M0 ${y}C240 ${y} 340 ${hubY} ${fanInX} ${hubY}`}
          stroke={`url(#${gradientId})`}
          strokeWidth={1}
        />
      ))}
      {sources.map((source, index) => {
        const y = rowY(index, sources.length, SOURCE_CHIP.spacing, hubY);
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
  const { pill, more, pillProviders, moreProviders } = layout;
  const rowCount = pillProviders.length + 1;
  const moreY = rowY(pillProviders.length, rowCount, pill.spacing, layout.hubY);
  const line = (y: number, endX: number) =>
    `M${layout.hubX + layout.hubGap} ${layout.hubY}C${layout.bend[0]} ${layout.hubY} ${layout.bend[1]} ${y} ${endX} ${y}`;

  return (
    <>
      {pillProviders.map((provider, index) => {
        const y = rowY(index, rowCount, pill.spacing, layout.hubY);
        const Logo = providerColorIcons[provider];
        return (
          <g key={provider}>
            <path
              d={line(y, layout.pillX)}
              strokeWidth={layout.lineStrokeWidth}
              strokeDasharray="3 4"
              className="stroke-foreground-tertiary opacity-70"
            />
            <rect
              x={layout.pillX}
              y={y - pill.height / 2}
              width={pill.width}
              height={pill.height}
              rx={pill.rx}
              className={cn("fill-popover", styles.chip)}
            />
            <Logo
              size={pill.iconSize}
              x={layout.pillX + pill.paddingX}
              y={y - pill.iconPx / 2}
            />
            <text
              x={layout.pillX + pill.paddingX + pill.iconPx + pill.iconGap}
              y={y}
              dominantBaseline="central"
              fontSize={pill.fontSize}
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
          strokeWidth={layout.lineStrokeWidth}
          strokeDasharray="3 4"
          className="stroke-foreground-tertiary opacity-40"
        />
        {moreProviders.map((provider, index) => {
          const centerX = layout.moreX + more.avatar / 2 + index * more.step;
          const Logo = providerColorIcons[provider];
          return (
            <g key={provider}>
              <circle
                cx={centerX}
                cy={moreY}
                r={more.avatar / 2}
                className={cn("fill-popover", styles.chip)}
              />
              <Logo
                size={more.iconSize}
                x={centerX - more.iconPx / 2}
                y={moreY - more.iconPx / 2}
              />
            </g>
          );
        })}
        <text
          x={
            layout.moreX +
            more.avatar +
            (moreProviders.length - 1) * more.step +
            more.labelGap
          }
          y={moreY}
          dominantBaseline="central"
          fontSize={more.fontSize}
          className="fill-foreground-secondary font-mono"
        >
          and more
        </text>
      </g>
    </>
  );
}

export function GatewayFanOutDiagram({
  sources,
  density = "default",
}: GatewayFanOutDiagramProps) {
  const showSources = density === "default" && sources.length > 0;
  const layout = selectLayout(density, showSources);
  const fanInX = layout.hubX - layout.hubGap;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      fill="none"
      aria-hidden="true"
      className="text-foreground block h-auto w-full overflow-visible"
    >
      {showSources ? (
        <SourceChips sources={sources} fanInX={fanInX} />
      ) : (
        <IncomingFan fanInX={fanInX} layout={layout} />
      )}
      <ProviderPills layout={layout} />
      <image
        href={iconSrc}
        x={layout.hubX - layout.hubSize / 2}
        y={layout.hubY - layout.hubSize / 2}
        width={layout.hubSize}
        height={layout.hubSize}
      />
    </svg>
  );
}
