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
        "inline-block max-w-full overflow-hidden text-ellipsis text-nowrap rounded bg-primary-accent/20 px-2 py-0.5 text-xs font-semibold text-accent-dark-blue shadow-sm hover:bg-accent-light-blue/45",
        className,
      )}
      href={path}
      title={title || value}
      prefetch={false}
      onClick={handleClick}
    >
      {icon ? icon : value}
    </Link>
  );
}
