import type { Metadata } from "next/types";

import CollectionHeader from "./CollectionHeader";
import { User, getServerSession } from "next-auth";
import { CollectionType } from "chromadb/dist/main/types";
// import { connectToVectorStore } from "@/util/middleware/chroma";
import { authOptions } from "@/src/server/auth";
import { connectToVectorStore } from "@/src/utils/middleware/chroma";

export function generateMetadata({
  params: { lang },
}: {
  params: { lang: Locale };
}): Metadata {
  return {
    // description: framework.description,
    title: "Truth Tables",
    authors: { name: "General Intelligence Group" },
  };
}

export default async function Root({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { lang: Locale; collectionName: string; projectId: string };
}) {
  const { lang, collectionName, projectId } = params;
  const session = await getServerSession(authOptions);
  let user: User | null = null;
  let collections: CollectionType[] = [];
  const vecStoreClient = connectToVectorStore();
  collections = await vecStoreClient.listCollections();

  if (session) {
    user = session.user;
  }

  return (
    <div className="flex h-screen flex-col pb-24">
      <CollectionHeader
        availableCollections={collections}
        lang={lang}
        collectionName={collectionName}
        user={user}
        projectId={projectId}
      />
      <div className="w-full flex-1">{children}</div>;
    </div>
  );
}
// Commmenting this out enabled production build exporting it enables dev
// export const dynamic = process.env.MODE === "development" ? "force-static" : "";

// export const dynamic = "force-static";
export const dynamic = "force-dynamic";
