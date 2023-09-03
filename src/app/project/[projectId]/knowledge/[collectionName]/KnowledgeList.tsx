import { User } from "next-auth";
import DocumentCard from "./CollectionCard";
import { DocumentMetadata } from "./page";

type Props = {
  knowledge: DocumentMetadata[] | null;
  lang: Locale;
  user: User | undefined;
};

const DocumentList = ({ knowledge, lang, user }: Props) => {
  return (
    <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
      {knowledge?.map((collection) => (
        <DocumentCard
          name={collection.title}
          key={collection.title}
          metadata={collection}
          lang={lang}
          user={user}
          visibility=""
        />
      ))}
    </main>
  );
};

export default DocumentList;
