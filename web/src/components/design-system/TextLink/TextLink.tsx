import Link from "next/link";
import { type IconComponent } from "@langfuse/icons";

export function TextLink({
  path,
  value,
  icon,
  trailingIcon,
  onClick,
  title,
  external = false,
}: TextLinkProps) {
  const Icon = icon;
  const TrailingIcon = trailingIcon;
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
      className="text-link hover:text-link-hover inline-block max-w-full text-xs leading-normal font-bold"
      href={path}
      title={title ?? value}
      prefetch={false}
      onClick={handleClick}
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
    >
      <span className="inline-block max-w-full overflow-hidden align-middle leading-normal text-nowrap text-ellipsis">
        {Icon || TrailingIcon ? (
          <span className="inline-flex max-w-full items-center gap-1">
            {Icon ? <Icon size="base" /> : null}
            <span className="truncate" title={title ?? value}>
              {value}
            </span>
            {TrailingIcon ? <TrailingIcon size="base" aria-hidden /> : null}
          </span>
        ) : (
          value
        )}
      </span>
    </Link>
  );
}

/** A link shows at most one icon, either before or after its text. */
export type TextLinkIconProps =
  | { icon?: IconComponent; trailingIcon?: never }
  | { icon?: never; trailingIcon?: IconComponent };

type TextLinkProps = {
  path: string;
  value: string;
  onClick?: (event: React.MouseEvent) => void;
  title?: string;
  /** Opens in a new tab. */
  external?: boolean;
} & TextLinkIconProps;
