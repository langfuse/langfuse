"use client";
import { useKnowledgeStore } from "@/src/store/KnowledgeStore";
import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { FormEvent } from "react";

type Props = { lang: Locale; collectionName: string };

const Search = ({ lang, collectionName }: Props) => {
  const [searchString, setSearchString] = useKnowledgeStore((state) => [
    state.searchString,
    state.setSearchString,
  ]);
  const { push } = useRouter();
  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    push(
      `/knowledge/search/${collectionName}?searchString=${searchString}`
    );
    setSearchString("");
  };
  return (
    <form
      onSubmit={submitSearch}
      className="flex items-center flex-1 gap-5 p-2 bg-white rounded-md shadow-md lg:flex-initial"
    >
      <button>
        <MagnifyingGlassIcon className="w-6 h-6 text-gray-400" />
      </button>
      <input
        className="flex-1 p-2 outline-none"
        placeholder="Filter"
        type="text"
        value={searchString}
        onChange={(e) => setSearchString(e.target.value)}
      />
      <button type="submit" hidden>
        Filter
      </button>
    </form>
  );
};

export default Search;
