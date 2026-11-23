import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { Minus, type IconComponent } from "@langfuse/icons";

import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { InAppAgentNotice } from "@/src/features/in-app-agent/components/InAppAgentNotice";
import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";

// Halo's own mark in the slot where the notice draws its icon.
const HaloNoticeIcon: IconComponent = forwardRef<
  SVGSVGElement,
  ComponentPropsWithoutRef<IconComponent>
>(function HaloNoticeIcon() {
  return <HaloIcon variant="header" />;
});

/**
 * Transient nudge that the run keeps going without the drawer. Lives in the
 * notice band, so showing it never shifts the composer or the run indicator.
 */
export function InAppAgentBackgroundHint({
  isExpanded,
  onMinimize,
}: {
  isExpanded: boolean;
  onMinimize: () => void;
}) {
  return (
    <InAppAgentNotice
      icon={HaloNoticeIcon}
      isExpanded={isExpanded}
      role="status"
      tone="neutral"
      actions={[{ text: "Minimize", icon: Minus, onClick: onMinimize }]}
    >
      I keep running in the background. Feel free to minimize, I&apos;ll notify
      you when I&apos;m done or need you.{" "}
      <span className="hidden align-middle md:inline-flex">
        <KeyboardShortcut variant="subtle" keys={["Mod", "I"]} />
      </span>
    </InAppAgentNotice>
  );
}
