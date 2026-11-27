import { type ReactNode } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";

export function V4MigrationExternalLink({
  href,
  children,
  size = "default",
  analytics,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  size?: "default" | "sm";
  /** Which guidance link in which section — for section_link_clicked. */
  analytics?: { section: string; link: string };
  ariaLabel?: string;
}) {
  const capture = usePostHogClientCapture();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("underline", size === "sm" && "text-sm")}
      aria-label={ariaLabel}
      onClick={
        analytics
          ? () => capture("v4_migration:section_link_clicked", analytics)
          : undefined
      }
    >
      {children}
    </a>
  );
}
