
import { connectToVectorStore } from "@/src/utils/middleware/chroma";
import FragmentList from "../FragmentList";
import { FragmentService } from "@/src/utils/middleware/chroma/fragment";

type Props = {
  searchParams?: {
    author: string;
    title: string;
    source: string;
    visibility: string;
  };
};
// const KnowledgeDocumentPage = ({ searchParams }: Props) => {
// console.log("searchParams", searchParams);
const KnowledgeDocumentPage = async ({
  params,
  searchParams,
}: {
  params: { collectionName: string; visibility: string; lang: Locale };
  searchParams: { author: string; title: string; source: string };
}) => {
  const { visibility, collectionName, lang } = params;
  const { author, title, source } = searchParams;
  // console.log("visibility:=", visibility);
  // console.log("params:=", params);
  // console.log("searchParams", searchParams);
  const vecStoreClient = connectToVectorStore();
  const fragService = new FragmentService(vecStoreClient);
  const fragments = await fragService.getFragments({
    collectionName,
    author,
    title,
    source,
  });
  console.log("fragments: ", fragments);
  return (
    <main className="max-w-7xl mx-auto">
      {/* <pre>{JSON.stringify(fragments, null, 2)}</pre> */}
      {fragments && (
        <FragmentList
          collectionName={collectionName}
          knowledge={fragments}
          lang={lang}
          visibility={visibility}
        />
      )}
    </main>
  );
};

export default KnowledgeDocumentPage;
export const dynamic = "force-dynamic";
