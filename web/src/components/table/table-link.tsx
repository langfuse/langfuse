import { cn } from "@/src/utils/tailwind";
import Link from "next/link";

export type TableLinkProps = {
  path: string;
  value: string;
  truncateAt?: number;
  icon?: React.ReactNode;
  className?: string;
};

export default function TableLink({
  path,
  value,
  truncateAt = 7,
  icon,
  className,
}: TableLinkProps) {
  const truncatedValue =
    value.length - truncateAt > 3
      ? `...${value.substring(value.length - truncateAt)}`
      : value;
  return (
    <Link
      className={cn(
        "inline-block rounded bg-primary-accent/20 px-2 py-1 text-xs font-semibold text-accent-dark-blue shadow-sm hover:bg-accent-light-blue/45",
        className,
      )}
      href={path}
      title={value}
    >
      {icon ? icon : truncatedValue}
    </Link>
  );
}
