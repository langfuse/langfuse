/* eslint-disable @repo/no-style-props, @repo/component-file-structure */
import { useState, type ComponentProps } from "react";
import { ControlledHoverCard } from "@/src/components/design-system/ControlledHoverCard/ControlledHoverCard";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { ExternalLink, Info } from "@langfuse/icons";

export function DocPopupTrigger({
  triggerProps,
}: {
  triggerProps: ComponentProps<"button">;
}) {
  return (
    <button
      type="button"
      aria-label="More information"
      className="text-muted-foreground inline-flex cursor-help items-center px-1 whitespace-nowrap"
      {...triggerProps}
    >
      <Info size="sm" />
    </button>
  );
}

export type DocPopupProps = {
  description: React.ReactNode;
  href?: string;
  className?: string;
};

export default function DocPopup({
  description,
  href,
  className,
  children,
}: DocPopupProps &
  Pick<ComponentProps<typeof ControlledHoverCard>, "children">) {
  const capture = usePostHogClientCapture();
  // Controlled so a CLICK/TAP on the icon also opens the card: HoverCard
  // never opens on touch by itself, and the old click-to-navigate behavior
  // is gone — docs open only via the explicit link inside the card.
  const [open, setOpen] = useState(false);
  // Single open-change path: Floating UI only calls onOpenChange from its own
  // hover/focus handling, so the click handler must route through here too
  // or tap-opens (the only way in on touch) would never be captured.
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      capture("help_popup:opened", {
        hfref: href,
        description: description,
      });
    }
  };

  return (
    <ControlledHoverCard
      openDelay={200}
      open={open}
      onOpenChange={handleOpenChange}
      content={
        <div className="w-64 p-3">
          <div
            className={cn(
              "text-primary text-xs font-normal whitespace-break-spaces sm:pl-0",
              className,
            )}
          >
            {description}
          </div>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                capture("help_popup:href_clicked", {
                  href: href,
                  description: description,
                });
              }}
              className="text-muted-foreground hover:text-primary mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2"
            >
              Read docs
              <ExternalLink size="sm" />
            </a>
          )}
        </div>
      }
    >
      {({ getTriggerProps, ...triggerContext }) =>
        children({
          ...triggerContext,
          getTriggerProps: (props) =>
            getTriggerProps({
              ...props,
              onClick: (e) => {
                props?.onClick?.(e);
                if (e.defaultPrevented) return;
                e.preventDefault();
                e.stopPropagation();
                handleOpenChange(!open);
              },
            }),
        })
      }
    </ControlledHoverCard>
  );
}
