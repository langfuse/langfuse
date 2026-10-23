import Link from "next/link";
import { type IconComponent } from "@langfuse/icons";

import { cn } from "@/src/utils/tailwind";

export function TextLink({
  path,
  value,
  icon,
  onClick,
  title,
  external = false,
  weight = "bold",
  size = "xs",
}: {
  path: string;
  value: string;
  icon?: IconComponent;
  onClick?: (event: React.MouseEvent) => void;
  title?: string;
  /** Opens in a new tab. */
  external?: boolean;
  /** `normal` for a link that sits in running text or a table row. */
  weight?: "bold" | "normal";
  size?: "xs" | "sm";
}) {
  const Icon = icon;
  const handleClick = (event: React.MouseEvent) => {
    if (!onClick) return;
    // Preserve native new-tab gestures when the link has a real destination.
    const isModifiedClick =
      event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
    if (path && isModifiedClick) return;
    event.preventDefault();
    onClick(event);
  };

  return (
    <Link
      className={cn(
        "text-link hover:text-link-hover inline-block max-w-full leading-normal",
        size === "xs" ? "text-xs" : "text-sm",
        weight === "bold" ? "font-bold" : "font-normal",
      )}
      href={path}
      title={title ?? value}
      prefetch={false}
      onClick={handleClick}
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
    >
      <span className="inline-block max-w-full overflow-hidden align-middle leading-normal text-nowrap text-ellipsis">
        {Icon ? (
          <span className="inline-flex max-w-full items-center gap-1">
            <Icon size="base" />
            <span className="truncate" title={title ?? value}>
              {value}
            </span>
          </span>
        ) : (
          value
        )}
      </span>
    </Link>
  );
}
