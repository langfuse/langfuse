import { useId } from "react";
import { Bot, type IconComponent, UserRound } from "@langfuse/icons";

import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import { cn } from "@/src/utils/tailwind";
import { GatewayKeySwitchboard } from "./GatewayKeySwitchboard";

const KEY_KINDS: ReadonlyArray<{
  icon: IconComponent;
  title: string;
  description: string;
}> = [
  {
    icon: UserRound,
    title: "User key",
    description:
      "Tied to one member. Revoked when they leave the organization.",
  },
  {
    icon: Bot,
    title: "Service account key",
    description: "For apps and pipelines. Keeps working when people leave.",
  },
];

/** The page header holds the actions, so the placeholder only explains keys. */
export function GatewayApiKeysEmptyState() {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id={titleId} className="text-2xl font-bold">
          No gateway keys yet
        </h2>
        <p className="text-muted-foreground max-w-lg text-sm">
          Create a gateway key to send requests through the AI Gateway from
          Claude Code, Codex, or your own code.
        </p>
      </div>
      <div
        className={cn(
          "bg-surface-section w-full rounded-lg border px-6 py-6",
          styles.dotGrid,
        )}
      >
        <div className="mx-auto aspect-[470/160] w-full max-w-lg">
          <GatewayKeySwitchboard />
        </div>
      </div>
      <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {KEY_KINDS.map(({ icon: Icon, title, description }) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-lg border px-4 py-3"
          >
            <span className="flex h-5 shrink-0 items-center">
              <Icon size="base" color="muted" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-bold">{title}</p>
              <p className="text-muted-foreground text-sm">{description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
