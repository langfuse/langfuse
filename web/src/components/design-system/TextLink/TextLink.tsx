import Link from "next/link";
import { type LucideIcon } from "lucide-react";

export function TextLink({
  path,
  value,
  icon,
  onClick,
  title,
}: {
  path: string;
  value: string;
  icon?: LucideIcon;
  onClick?: (event: React.MouseEvent) => void;
  title?: string;
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
      className="text-link hover:text-link-hover inline-block max-w-full text-xs leading-normal font-bold"
      href={path}
      title={title ?? value}
      prefetch={false}
      onClick={handleClick}
    >
      <span className="inline-block max-w-full overflow-hidden align-middle leading-normal text-nowrap text-ellipsis">
        {Icon ? (
          <span className="inline-flex max-w-full items-center gap-1">
            <Icon className="h-3.5 w-3.5 shrink-0" />
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
