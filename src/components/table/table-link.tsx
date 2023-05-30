import { lastCharacters } from "@/src/utils/string";
import { useRouter } from "next/router";

export type TableLinkProps = {
  path: string;
  value: string;
};

export default function TableLink({ path, value }: TableLinkProps) {
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
        ...{lastCharacters(value, 7)}
      </button>
    </div>
  );
}
