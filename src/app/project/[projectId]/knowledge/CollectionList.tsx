"use client";
import { useKnowledgeStore } from "@/src/store/KnowledgeStore";
import CollectionCard from "./CollectionCard";
import { User } from "next-auth";
// import { useKnowledgeStore } from "@/store/KnowledgeStore";

type Props = {
  knowledge: Record<string, any>[];
  lang: Locale;
  user: User | null;
  projectId: string;
};

const CollectionList = ({ user, knowledge, lang, projectId }: Props) => {
  const searchString = useKnowledgeStore((state) => state.searchString);
  console.log("searchString: ", searchString);
  return (
    <main className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
      {knowledge?.map((collection) => {
        if (
          searchString &&
          (!collection.metadata.title
            .toLowerCase()
            .includes(searchString.toLowerCase()) ||
            !collection.metadata.description
              .toLowerCase()
              .includes(searchString.toLowerCase()))
        )
          return null;
        return (
          <CollectionCard
            projectId={projectId}
            user={user}
            name={collection.name}
            key={collection.id}
            metadata={collection.metadata}
            lang={lang}
          />
        );
      })}
    </main>
  );
};

export default CollectionList;
