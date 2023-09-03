"use client";
import { User } from "next-auth";
import CollectionCard from "./CollectionCard";
import { DocumentMetadata } from "./page";
import { useKnowledgeStore } from "@/src/store/KnowledgeStore";
// import { useKnowledgeStore } from "@/src/store/KnowledgeStore";

type Props = {
  knowledge: DocumentMetadata[] | null;
  lang: Locale;
  projectId: string;
  collectionName: string;
  user: User | null;
};

const CollectionList = ({
  knowledge,
  lang,
  projectId,
  collectionName,
  user,
}: Props) => {
  const searchString = useKnowledgeStore((state) => state.searchString);

  return (
    <main className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
      {knowledge?.map((collection) => {
        if (
          searchString &&
          (!collection.title
            .toLowerCase()
            .includes(searchString.toLowerCase()) ||
            !collection.description
              .toLowerCase()
              .includes(searchString.toLowerCase()))
          // || !collection.usefulFor
          //   .toLowerCase()
          //   .includes(searchString.toLowerCase())
        )
          return null;
        return (
          <CollectionCard
            projectId={projectId}
            name={collectionName}
            key={collection.title}
            metadata={collection}
            lang={lang}
            user={user}
          />
        );
      })}
    </main>
  );
};

export default CollectionList;
