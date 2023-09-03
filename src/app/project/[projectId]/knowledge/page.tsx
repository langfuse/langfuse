import CollectionList from "./CollectionList";
import { getServerSession } from "next-auth";
// import { options } from "@/app/api/auth/[...nextauth]/options";
import { User } from "next-auth";
import { authOptions } from "@/src/server/auth";
import { connectToVectorStore } from "@/src/utils/middleware/chroma";

type Props = {
  params: { lang: Locale; projectId: string };
};

export default async function KnowledgePage({
  params: { lang, projectId },
}: Props) {
  const session = await getServerSession(authOptions);
  let user: User | null = null;
  if (session) {
    user = session.user;
  }
  const vecStoreClient = await connectToVectorStore();
  // console.log(vecStoreClient);
  const collections = (await vecStoreClient.listCollections()).filter(
    (col) => col && col.metadata?.projectId === projectId
  );
  // console.log(collections, "collections)");

  return (
    <main className="mx-auto max-w-7xl p-6">
      <CollectionList
        user={user}
        lang={lang}
        knowledge={collections}
        projectId={projectId}
      />
    </main>
  );
}

export const dynamic = "force-dynamic";
