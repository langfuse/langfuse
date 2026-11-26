import { KeyRound } from "@langfuse/icons";

import diagramStyles from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/gatewayFanOutDiagram.module.css";
import { cn } from "@/src/utils/tailwind";

const KEY = { x: 40, y: 80, width: 150, height: 34 };
const CLIENT = { x: 280, width: 150, height: 26 };
const CLIENTS = [
  { label: "Claude Code", y: 34 },
  { label: "Codex", y: 80 },
  { label: "Your own code", y: 126 },
];

const KEY_RIGHT = KEY.x + KEY.width;
const BEND_X = (KEY_RIGHT + CLIENT.x) / 2;

/** Illustration: one gateway key used from several clients. */
export function GatewayKeySwitchboard() {
  return (
    <svg
      viewBox="0 0 470 160"
      fill="none"
      className="h-full w-full overflow-visible"
      aria-hidden="true"
    >
      {CLIENTS.map(({ label, y }, index) => {
        const connector = `M${KEY_RIGHT} ${KEY.y}C${BEND_X} ${KEY.y},${BEND_X} ${y},${CLIENT.x} ${y}`;
        return (
          <g key={label}>
            <path
              d={connector}
              strokeWidth={0.9}
              className="stroke-foreground-tertiary"
            />
            <path
              d={connector}
              pathLength={100}
              strokeWidth={1.8}
              strokeLinecap="round"
              className={cn("stroke-muted-foreground", diagramStyles.pulse)}
              style={{ animationDelay: `${index * -1.1}s` }}
            />
            <rect
              x={CLIENT.x}
              y={y - CLIENT.height / 2}
              width={CLIENT.width}
              height={CLIENT.height}
              rx={5}
              className={cn("fill-popover", diagramStyles.chip)}
            />
            <text
              x={CLIENT.x + 10}
              y={y}
              dominantBaseline="central"
              fontSize={11}
              className="fill-foreground-secondary font-mono"
            >
              {label}
            </text>
          </g>
        );
      })}
      <rect
        x={KEY.x}
        y={KEY.y - KEY.height / 2}
        width={KEY.width}
        height={KEY.height}
        rx={5}
        className={cn("fill-popover", diagramStyles.chip)}
      />
      <rect
        x={KEY.x + 8}
        y={KEY.y - 11}
        width={22}
        height={22}
        rx={4}
        className="fill-foreground"
      />
      <KeyRound
        size="sm"
        color="inherit"
        __rawClassName="text-background"
        x={KEY.x + 13}
        y={KEY.y - 6}
      />
      <text
        x={KEY.x + 40}
        y={KEY.y}
        dominantBaseline="central"
        fontSize={11}
        className="fill-foreground-secondary font-mono"
      >
        lf-gw-••••••••
      </text>
    </svg>
  );
}
