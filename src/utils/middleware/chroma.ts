import { ChromaClient } from "chromadb";

let chromaStore: ChromaClient | null = null;

export function connectToVectorStore(): ChromaClient {
  if (chromaStore) {
    return chromaStore;
  }
  console.log("Connecting to chroma store: ", process.env.VECTOR_STORE_HOST_PATH);
  const client = new ChromaClient({ path: process.env.VECTOR_STORE_HOST_PATH! });

  chromaStore = client;
  return client;
}