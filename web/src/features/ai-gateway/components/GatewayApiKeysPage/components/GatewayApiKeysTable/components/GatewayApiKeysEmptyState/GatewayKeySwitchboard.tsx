import { KeyRound } from "@langfuse/icons";

import styles from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/gatewaySetupHero.module.css";
import { cn } from "@/src/utils/tailwind";

const KEY = { x: 40, y: 80, width: 150, height: 34 };
const CLIENT = { x: 280, width: 150, height: 26 };

/** Delays spread the dots; the offsets are where they rest without motion. */
const CLIENTS = [
  { label: "Claude Code", y: 34, className: undefined, restOffset: -30 },
  { label: "Codex", y: 80, className: styles.trafficDelay1, restOffset: -55 },
  {
    label: "Your own code",
    y: 126,
    className: styles.trafficDelay2,
    restOffset: -75,
  },
];

const KEY_RIGHT = KEY.x + KEY.width;
const BEND_X = (KEY_RIGHT + CLIENT.x) / 2;

/** Illustration: one gateway key used from several clients. */
export function GatewayKeySwitchboard() {
  return (
    <svg viewBox="0 0 470 160" className="h-full w-full" aria-hidden="true">
      {CLIENTS.map(({ label, y, className, restOffset }) => {
        const connector = `M${KEY_RIGHT} ${KEY.y}C${BEND_X} ${KEY.y},${BEND_X} ${y},${CLIENT.x} ${y}`;
        return (
          <g key={label}>
            <path
              d={connector}
              fill="none"
              strokeWidth={1.1}
              strokeLinecap="round"
              className="stroke-muted-foreground"
              strokeOpacity={0.6}
            />
            <path
              d={connector}
              pathLength={100}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDashoffset={restOffset}
              className={cn("stroke-foreground", styles.traffic, className)}
            />
            <rect
              x={CLIENT.x}
              y={y - CLIENT.height / 2}
              width={CLIENT.width}
              height={CLIENT.height}
              rx={4}
              className="fill-background stroke-border"
            />
            <text
              x={CLIENT.x + 10}
              y={y + 3.8}
              fontSize={11}
              className="fill-foreground font-mono"
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
        rx={4}
        className="fill-background stroke-border"
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
        y={KEY.y + 4}
        fontSize={11}
        className="fill-foreground font-mono"
      >
        lf-gw-••••••••
      </text>
    </svg>
  );
}
