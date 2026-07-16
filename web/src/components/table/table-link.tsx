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
    if (onClick) {
      event.preventDefault();
      onClick(event);
    }
  };

  return (
    <Link
      className={cn(
        // text-primary, not text-link: inside row-clickable tables the accent
        // paint is redundant signaling at column scale — links read as the
        // bright emphasis tier (brighter than body) + bold, with underline on
        // hover as the anchor cue. Prose links elsewhere keep --link.
        "text-primary inline-block max-w-full text-xs leading-normal font-bold hover:underline",
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
