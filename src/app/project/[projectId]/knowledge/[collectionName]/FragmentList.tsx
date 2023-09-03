"use client";
import { useKnowledgeStore } from "@/src/store/KnowledgeStore";
import { FragmentDTO } from "@/src/utils/middleware/chroma/fragment";
// import { useKnowledgeStore } from "@/store/KnowledgeStore";
import dynamic from "next/dynamic";

const FragmentCard = dynamic(() => import("./FragmentCard"));

type Props = {
  collectionName: string;
  knowledge: FragmentDTO[];
  lang: Locale;
  visibility: string;
};

const FragmentList = ({
  visibility,
  collectionName,
  knowledge,
  lang,
}: Props) => {
  const searchString = useKnowledgeStore((state) => state.searchString);
  return (
    <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
      {knowledge?.map((fragment, idx) => {
        // if (
        //   searchString &&
        //   !fragment.pageContent
        //     .toLowerCase()
        //     .includes(searchString.toLowerCase())
        // )
        //   return null;
        return (
          <FragmentCard
            pageContent={fragment.pageContent}
            visibility={visibility}
            name={collectionName}
            index={idx}
            key={idx}
            metadata={fragment.metadata}
            lang={lang}
          />
        );
      })}
    </main>
  );
};

export default FragmentList;
