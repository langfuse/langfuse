import { useRouter } from "next/router";

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
  const router = useRouter();

  return (
    <div>
      <button
        key="openTrace"
        className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-blue-600 shadow-sm hover:bg-indigo-100"
        onClick={() => {
          void router.push(path);
        }}
      >
        {value.length > truncateAt
          ? `...${value.substring(value.length - truncateAt)}`
          : value}
      </button>
    </div>
  );
}
