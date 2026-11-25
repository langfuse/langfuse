import { SiAnthropic, SiOpenai } from "@langfuse/icons/si";

import { env } from "@/src/env.mjs";

const HERO_FAN = [
  { d: "M-20 4C128 4,174 127.2,222 144", opacity: 0.36 },
  { d: "M-20 32C135.4 32,174 130.6,222 144", opacity: 0.52 },
  { d: "M-20 60C119 60,174 133.9,222 144", opacity: 0.66 },
  { d: "M-20 88C123.3 88,174 137.3,222 144", opacity: 0.42 },
  { d: "M-20 116C121.7 116,174 140.6,222 144", opacity: 0.46 },
  { d: "M-20 144C135.9 144,174 144,222 144", opacity: 0.44 },
  { d: "M-20 172C123.7 172,174 147.4,222 144", opacity: 0.38 },
  { d: "M-20 200C125.1 200,174 150.7,222 144", opacity: 0.67 },
  { d: "M-20 228C113 228,174 154.1,222 144", opacity: 0.49 },
  { d: "M-20 256C132.8 256,174 157.4,222 144", opacity: 0.68 },
  { d: "M-20 284C123.2 284,174 160.8,222 144", opacity: 0.36 },
];

const PROVIDERS = [
  { label: "Anthropic", Icon: SiAnthropic },
  { label: "OpenAI", Icon: SiOpenai },
];

const iconSrc = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

/** Illustration: many lines enter one Langfuse point, which routes to the enabled providers. */
export function GatewaySwitchboard() {
  return (
    <svg
      viewBox="0 0 640 288"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden="true"
    >
      {HERO_FAN.map(({ d, opacity }) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeWidth={1}
          strokeLinecap="round"
          strokeOpacity={opacity}
          className="stroke-muted-foreground"
        />
      ))}
      {PROVIDERS.map(({ label, Icon }, index) => {
        const y = 94 + index * 50;
        return (
          <g key={label}>
            <path
              d={`M266 144C310 144,310 ${y},354 ${y}`}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="stroke-foreground"
            />
            <rect
              x={354}
              y={y - 15}
              width={200}
              height={30}
              rx={4}
              className="fill-background stroke-border"
            />
            <Icon size="base" color="foreground" x={364} y={y - 7} />
            <text
              x={385}
              y={y + 4}
              fontSize={12}
              className="fill-foreground font-mono"
            >
              {label}
            </text>
            <rect
              x={518}
              y={y - 6}
              width={21}
              height={12}
              rx={6}
              className="fill-foreground"
            />
            <circle cx={533} cy={y} r={4.5} className="fill-surface-section" />
          </g>
        );
      })}
      <path
        d="M266 144C310 144,310 194,354 194"
        fill="none"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeDasharray="3 4"
        className="stroke-muted-foreground"
      />
      <rect
        x={354}
        y={179}
        width={200}
        height={30}
        rx={4}
        className="fill-background stroke-border"
      />
      <text
        x={364}
        y={198}
        fontSize={12}
        className="fill-muted-foreground font-mono"
      >
        More soon
      </text>
      <rect
        x={518}
        y={188}
        width={21}
        height={12}
        rx={6}
        className="fill-border"
      />
      <circle cx={524} cy={194} r={4.5} className="fill-surface-section" />
      <circle cx={244} cy={144} r={21} className="fill-surface-section" />
      <image href={iconSrc} x={220} y={120} width={48} height={48} />
    </svg>
  );
}
