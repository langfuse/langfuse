import type { ReactNode } from "react";
import { type IconComponent } from "@langfuse/icons";

import {
  Banner,
  type BannerAction,
} from "@/src/components/design-system/Banner/Banner";
import { cn } from "@/src/utils/tailwind";

const NOTICE_BANNER_VARIANTS = {
  neutral: "neutral",
  warning: "warning",
  danger: "error",
} as const;

/**
 * Composer-adjacent notice band. Margin lives here: showing a notice must not
 * shift the composer or the run indicator.
 */
export function InAppAgentNotice({
  actions,
  children,
  icon,
  isExpanded,
  role,
  title,
  tone,
}: {
  actions?: ReadonlyArray<BannerAction>;
  children: ReactNode;
  /** Replaces the icon the tone comes with. */
  icon?: IconComponent;
  isExpanded: boolean;
  role: "status" | "alert";
  title?: string;
  tone: keyof typeof NOTICE_BANNER_VARIANTS;
}) {
  return (
    <div className="shrink-0 px-1.5 pb-2">
      <div className={cn(isExpanded && "mx-auto max-w-3xl")}>
        <Banner
          variant={NOTICE_BANNER_VARIANTS[tone]}
          role={role}
          title={title}
          icon={icon}
          actions={actions}
        >
          {children}
        </Banner>
      </div>
    </div>
  );
}
