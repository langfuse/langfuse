/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/utils/tailwind";
import Link from "next/link";

export type TableLinkProps = {
  path: string;
  value: string;
  icon?: React.ReactNode;
  className?: string;
  onClick?: (event: React.MouseEvent) => void;
  title?: string;
};

export default function TableLink({
  path,
  value,
  icon,
  className,
  onClick,
  title,
}: TableLinkProps) {
  const handleClick = (event: React.MouseEvent) => {
    if (!onClick) return;
    // A modifier click (cmd/ctrl+click, shift+click) or a non-primary button
    // (middle-click) is the browser's own "open in a new tab/window" gesture
    // — let it through to the real anchor href instead of hijacking it (e.g. a
    // peek-opening `onClick`), as long as there IS a real destination to open.
    // `path=""` callers (e.g. folder breadcrumbs, which use `onClick` as their
    // only action) have no real destination, so they keep the old
    // always-intercept behavior.
    const isModifiedClick =
      event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
    if (path && isModifiedClick) return;
    event.preventDefault();
    onClick(event);
  };

  return (
    <Link
      className={cn(
        "text-link hover:text-link-hover inline-block max-w-full text-xs leading-normal font-bold",
        className,
      )}
      href={path}
      title={title || value}
      prefetch={false}
      onClick={handleClick}
    >
      <span className="inline-block max-w-full overflow-hidden align-middle leading-normal text-nowrap text-ellipsis">
        {icon ? <span className="inline-block">{icon}</span> : value}
      </span>
    </Link>
  );
}
