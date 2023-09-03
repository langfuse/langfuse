import { authOptions } from "@/src/server/auth";
import { connectToVectorStore } from "@/src/utils/middleware/chroma";
import { getServerSession } from "next-auth";
import { User } from "next-auth";

type Props = {
  params: { lang: Locale; collectionName: string };
};

export default async function KnowledgePage({
  params: { lang, collectionName },
}: Props) {
  const session = await getServerSession(authOptions);
  let user: User | null = null;
  if (session) {
    user = session.user;
  }
  const vecStoreClient = await connectToVectorStore();
  const collections = (await vecStoreClient.listCollections()).filter(
    (col) => col && col.metadata?.visibility === "public"
  );
  // console.log(vecStoreClient);
  // console.log(collections, "collections)");

  console.log(`Collection ${collectionName} session :`, session);
  return <main className="max-w-7xl mx-auto">Search Page</main>;
}
