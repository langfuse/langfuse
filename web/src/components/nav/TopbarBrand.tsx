/* eslint-disable no-nested-ternary */
/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/utils/tailwind";
import { SafeImage } from "@/src/components/design-system/SafeImage/SafeImage";
import { SafeImageController } from "@/src/components/design-system/SafeImageController/SafeImageController";
import Link from "next/link";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { PlusIcon } from "@langfuse/icons";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { LangfuseWordmark } from "@/src/components/design-system/LangfuseWordmark/LangfuseWordmark";

/**
 * Compact Langfuse brand mark for the top bar.
 *
 * The primary brand lives in the sidebar header. Once the sidebar goes
 * off-canvas (below `md`, where it collapses into a Sheet) nothing brands the
 * app, so the page header renders this compact mark instead — mirroring the
 * icon the sidebar itself shows when collapsed.
 *
 * `variant="icon"` (default) renders just the Langfuse mark; `variant="wordmark"`
 * renders the full logotype, for the centered brand in the mobile top bar.
 *
 * Respects the self-host UI-customization logo entitlement, same as
 * `LangfuseLogo`, and links to `/` like the sidebar logo.
 */
export const TopbarBrand = ({
  className,
  variant = "icon",
}: {
  className?: string;
  variant?: "icon" | "wordmark";
}) => {
  const uiCustomization = useUiCustomization();
  const logoLight = uiCustomization?.logoLightModeHref;
  const logoDark = uiCustomization?.logoDarkModeHref;

  return (
    <Link
      href="/"
      aria-label="Langfuse home"
      className={cn("flex shrink-0 items-center gap-1", className)}
    >
      {logoLight && logoDark ? (
        // Custom logo (max aspect ratio 1:3 per docs) + the Langfuse mark,
        // matching LangfuseLogo's customized layout.
        <>
          <SafeImageController src={logoLight}>
            {(state) => (
              <SafeImage
                state={state}
                alt="Logo"
                className="max-h-5 max-w-16 dark:hidden"
              />
            )}
          </SafeImageController>
          <SafeImageController src={logoDark}>
            {(state) => (
              <SafeImage
                state={state}
                alt="Logo"
                className="hidden max-h-5 max-w-16 dark:block"
              />
            )}
          </SafeImageController>
          <PlusIcon size="sm" color="muted" />
          <LangfuseIcon size={16} />
        </>
      ) : variant === "wordmark" ? (
        <LangfuseWordmark size="md" />
      ) : (
        <LangfuseIcon size={28} />
      )}
    </Link>
  );
};
