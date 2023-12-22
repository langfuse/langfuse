import Link from "next/link";

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
  return (
    <div>
      <Link
        key="openTrace"
        className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-blue-600 shadow-sm hover:bg-indigo-100"
        href={path}
      >
        {value.length > truncateAt
          ? `...${value.substring(value.length - truncateAt)}`
          : value}
      </Link>
    </div>
  );
}
