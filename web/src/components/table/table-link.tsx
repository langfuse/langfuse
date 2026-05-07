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
        "text-accent-dark-blue hover:text-primary-accent/60 inline-block max-w-full text-xs font-semibold",
        className,
        icon && "max-h-4",
      )}
      href={path}
      title={title || value}
      prefetch={false}
      onClick={handleClick}
    >
      <span className="inline-block max-w-full overflow-hidden text-nowrap text-ellipsis">
        {icon ? <span className="inline-block">{icon}</span> : value}
      </span>
    </Link>
  );
}
