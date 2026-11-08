import { useId } from "react";
import { BookOpen } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { GATEWAY_OVERVIEW_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { cn } from "@/src/utils/tailwind";

const SOURCES = ["Claude Code", "Codex", "OpenCode", "Your apps"];

export type GatewayNotSetUpNoticeProps = {
  organizationName: string | undefined;
  providers: GatewaySetupSwitchboardProps["providers"];
};

/** Shown to members who cannot set up the gateway while no admin has done so. */
export function GatewayNotSetUpNotice({
  organizationName,
  providers,
}: GatewayNotSetUpNoticeProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id={titleId} className="text-2xl font-bold">
          AI Gateway isn’t set up yet
        </h2>
        <p className="text-muted-foreground max-w-lg text-sm">
          An admin or owner of {organizationName ?? "your organization"} needs
          to connect a provider before you can create a gateway key. Ask them to
          set it up.
        </p>
      </div>
      <Button
        variant="outline"
        text="Learn more about AI Gateway"
        icon={BookOpen}
        href={GATEWAY_OVERVIEW_DOCS_URL}
      />
      <div
        className={cn(
          "bg-surface-section w-full rounded-lg border px-6 py-8",
          styles.dotGrid,
        )}
      >
        <div className="mx-auto aspect-[440/200] w-full max-w-xl opacity-50 grayscale">
          <GatewaySetupSwitchboard
            providers={providers}
            sources={SOURCES}
            idleLabel="Not set up"
          />
        </div>
      </div>
    </section>
  );
}
