// import NavLink from "../news/NavLink";
import Link from "next/link";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";
import Search from "./Search";
import CollectionMenuBar from "./CollectionMenuBar";
import { CollectionType } from "chromadb/dist/main/types";
import { User } from "next-auth";
import { knowledgeCategories } from "@/src/assets/constants";
import NavLink from "@/src/components/ui/NavLink";
type Props = {
  lang: Locale;
  collectionName: string;
  projectId: string;
  availableCollections: CollectionType[];
  user: User | null;
};

export default function CollectionHeader({
  lang,
  collectionName,
  availableCollections,
  user,
  projectId
}: Props) {
  return (
    <header>
      {/* <nav className="flex flex-wrap justify-center md:grid md:grid-cols-7 text-xs md:text-sm gap-x-4 pb-2 max-w-6xl mx-auto border-b-2">
        {knowledgeCategories.map((category) => (
          <NavLink
            path="knowledge"
            key={category}
            category={category}
            lang={lang}
          />
        ))}
      </nav> */}
      <section className="w-full bg-gray-500/10 ">
        <div className="relative max-w-7xl mx-auto flex flex-col items-center p-5 lg:flex-row rounded-b-2xl">
          <Link
            href={`/project/${projectId}/knowledge`}
            className="flex flex-col items-end justify-start w-full gap-3 mb-5 text-center sm:text-left sm:flex-row"
          >
            <div>
              <BuildingLibraryIcon className="w-24 h-24 mx-auto" />
              <p className="font-serif text-sm italic font-medium tracking-widest text-center underline decoration-secondary-500 text-primary-950 underline-offset-3">
                The Knowledge Network
              </p>
            </div>
            <div>
              <h2 className="font-serif text-6xl tracking-widest">
                Truth Tables
              </h2>
              <p className="tracking-[9px] text-[18px] uppercase">
                Distributed Knowledge Management
              </p>
            </div>
          </Link>

          <div className="flex items-center justify-end flex-1 w-full gap-5">
            <Search lang={lang} collectionName={collectionName} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto">
          <CollectionMenuBar
            availableCollections={availableCollections}
            lang={lang}
            collectionName={collectionName}
            user={user}
            projectId={projectId}
          />
        </div>
      </section>
    </header>
  );
}
