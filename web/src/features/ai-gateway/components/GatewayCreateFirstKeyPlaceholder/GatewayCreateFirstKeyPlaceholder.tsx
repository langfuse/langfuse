import { type ReactNode, useId } from "react";
import Link from "next/link";
import {
  BookOpen,
  Box,
  type IconComponent,
  KeyRound,
  Plus,
} from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { cn } from "@/src/utils/tailwind";

const SOURCES = ["Claude Code", "Codex", "OpenCode", "Your apps"];

export type GatewayCreateFirstKeyPlaceholderProps = {
  organizationName: string | undefined;
  providers: GatewaySetupSwitchboardProps["providers"];
  onCreateKey: () => void;
  usageInstructionsHref: string;
  modelsHref: string;
};

/** Shown to members of a set-up gateway until they create their first key. */
export function GatewayCreateFirstKeyPlaceholder({
  organizationName,
  providers,
  onCreateKey,
  usageInstructionsHref,
  modelsHref,
}: GatewayCreateFirstKeyPlaceholderProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id={titleId} className="text-2xl font-bold">
          Create your gateway key
        </h2>
        <p className="text-muted-foreground max-w-lg text-sm">
          Your admin set up the AI Gateway for{" "}
          {organizationName ?? "your organization"}. Create a personal key to
          send requests from Claude Code, Codex, or your own code.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button text="Create my key" icon={Plus} onClick={onCreateKey} />
        <Button
          variant="outline"
          text="Usage instructions"
          icon={BookOpen}
          href={usageInstructionsHref}
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
        <BenefitCard
          icon={KeyRound}
          title="Create your own keys"
          description="Mint a new key whenever you need one."
        />
        <BenefitCard
          icon={Box}
          title="One key for Anthropic and OpenAI models"
          description={
            <>
              Use the same key across providers.{" "}
              <Link href={modelsHref} className="underline">
                See available models
              </Link>
            </>
          }
        />
      </ul>
    </section>
  );
}

function BenefitCard({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComponent;
  title: string;
  description: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border px-4 py-3">
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
  );
}
