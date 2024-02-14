import Link from "next/link";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";

export type TableLinkProps = {
  path: string;
  value: string;
  truncateAt?: number;
};

export default function TableLink({
  path,
  value,
  truncateAt = 7,
}: TableLinkProps) {
  const [isHovered, setIsHovered] = useState(false);
  const truncatedValue =
    value.length - truncateAt > 0
      ? `...${value.substring(value.length - truncateAt)}`
      : value;
  const isTruncated = value !== truncatedValue;
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative"
    >
      <Link
        className={cn(
          isHovered && isTruncated ? "opacity-0" : "opacity-100",
          isHovered && !isTruncated ? "bg-indigo-100" : "bg-indigo-50",
          "absolute inline-block rounded  px-2 py-1 text-xs font-semibold text-blue-600 shadow-sm transition-opacity duration-300",
        )}
        href={path}
        title={value}
      >
        {truncatedValue}
      </Link>
      <Link
        className={cn(
          isHovered && isTruncated ? "opacity-100" : "opacity-0",
          "inline-block rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-blue-600 shadow-sm transition-opacity duration-300",
        )}
        href={path}
        title={value}
      >
        {value}
      </Link>
    </div>
  );
}
