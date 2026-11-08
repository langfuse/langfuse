import { useId } from "react";
import {
  BookOpen,
  CircleDollarSign,
  type IconComponent,
  KeyRound,
  ShieldCheck,
  TextAlignStart,
} from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { cn } from "@/src/utils/tailwind";

const SOURCES = ["Claude Code", "Codex", "OpenCode", "Your apps"];

const BENEFITS: ReadonlyArray<{
  icon: IconComponent;
  title: string;
  description: string;
}> = [
  {
    icon: KeyRound,
    title: "One key for every provider",
    description: "Use one key for Anthropic and OpenAI.",
  },
  {
    icon: CircleDollarSign,
    title: "Spend by person and team",
    description: "Track spend by person, team, and key.",
  },
  {
    icon: ShieldCheck,
    title: "Approved models only",
    description: "Approve and remove models for entire company.",
  },
  {
    icon: TextAlignStart,
    title: "Full traces",
    description: "Record full traces, not just token counts.",
  },
];

export type GatewayAnalyticsNoKeysEmptyStateProps = {
  gatewayKeysHref: string;
  docsHref: string;
  providers: GatewaySetupSwitchboardProps["providers"];
};

/** Overview before any gateway key exists: what to do next and what the gateway adds. */
export function GatewayAnalyticsNoKeysEmptyState({
  gatewayKeysHref,
  docsHref,
  providers,
}: GatewayAnalyticsNoKeysEmptyStateProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id={titleId} className="text-2xl font-bold">
          Send your first request
        </h2>
        <p className="text-muted-foreground max-w-lg text-sm">
          Cost and usage show up here once requests go through the AI Gateway.
          Add a gateway key, then point your LLM client at the gateway.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button text="Add gateway key" icon={KeyRound} href={gatewayKeysHref} />
        <Button
          variant="outline"
          text="Read the docs"
          icon={BookOpen}
          href={docsHref}
        />
      </div>
      <div
        className={cn(
          "bg-surface-section w-full rounded-lg border px-6 py-8",
          styles.dotGrid,
        )}
      >
        <div className="mx-auto aspect-[440/200] w-full max-w-xl">
          <GatewaySetupSwitchboard providers={providers} sources={SOURCES} />
        </div>
      </div>
      <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {BENEFITS.map(({ icon: Icon, title, description }) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-lg border px-4 py-3"
          >
            <Icon
              size="base"
              color="muted"
              aria-hidden
              __rawClassName="mt-0.5 shrink-0"
            />
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
