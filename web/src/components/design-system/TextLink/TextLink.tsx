import Link from "next/link";
import { SquareArrowOutUpRight, type IconComponent } from "@langfuse/icons";

export function TextLink({
  path,
  value,
  icon,
  onClick,
  title,
  external = false,
  variant = "standalone",
}: {
  path: string;
  value: string;
  icon?: IconComponent;
  onClick?: (event: React.MouseEvent) => void;
  title?: string;
  /** Opens in a new tab. */
  external?: boolean;
  /** `inline` sits within running text: inherited size, normal weight, underlined, trailing external icon. */
  variant?: "standalone" | "inline";
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

  if (variant === "inline") {
    return (
      <Link
        className="text-link hover:text-link-hover underline underline-offset-2"
        href={path}
        title={title}
        prefetch={false}
        onClick={handleClick}
        {...(external && { target: "_blank", rel: "noopener noreferrer" })}
      >
        {value}
        {external && (
          <SquareArrowOutUpRight
            aria-hidden
            size="sm"
            color="muted"
            __rawClassName="ml-0.75 inline-block align-[-1px]"
          />
        )}
      </Link>
    );
  }

  return (
    <Link
      className="text-link hover:text-link-hover inline-block max-w-full text-xs leading-normal font-bold"
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
