"use server";

import { revalidatePath } from "next/cache";
import { CollectionDTO } from "../middleware/chroma/collection";
import { connectToVectorStore } from "../middleware/chroma";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/src/server/auth";

export async function addCollection(metadata: CollectionMetadata) {
  const client = connectToVectorStore();
  await client.createCollection({
    name: randomUUID(),
    metadata,
  });
  let headersList = {
    "Content-Type": "application/json",
  };
  const session = await getServerSession(authOptions);

  let bodyContent = JSON.stringify({
    model: "platypus2-13b",
    share:
      "https://drive.google.com/drive/folders/1mkW3UBDNHJlYWKS3GI2s16cjxsryGj5m?usp=sharing",
    project: metadata.projectId,
    owner: session?.user,
    title: metadata.title,
    description: metadata.description,
    visibility: metadata.visibility,
    lf_pub: "pk-lf-df819d99-c25e-4ec8-a1c4-2c09cad07cea",
    lf_priv: "sk-lf-47dae097-66c6-4a2a-ab37-0b34c9d466f4",
  });

  fetch("http://api:80/memory/graph", {
    method: "POST",
    body: bodyContent,
    headers: headersList,
  });

  revalidatePath("/");
}

export async function copyCollection(
  metadata: CollectionMetadata,
  sourceCollection: string
) {
  const client = connectToVectorStore();
  await client.createCollection({
    name: randomUUID(),
    metadata,
  });

  revalidatePath("/");
}

export async function deleteCollection(name: string) {
  const client = connectToVectorStore();
  await client.deleteCollection({
    name,
  });

  revalidatePath("/");
}

export async function updateCollection(
  origin: KnowledgeCategory,
  candidate: Omit<CollectionDTO, "id">
) {
  const { name, metadata } = candidate;
  console.log("Updating candidate : ", candidate);

  const client = connectToVectorStore();
  const collection = await client.getCollection({ name });
  console.log("metadata: ", metadata);
  await collection.modify({ metadata });
  revalidatePath("/");
  revalidatePath(
    `/knowledge/${candidate.metadata.visibility}/${candidate.name}`
  );
  revalidatePath(`/knowledge/${candidate.metadata.visibility}/`);
  revalidatePath(`/knowledge/${origin}/${candidate.name}`);
  revalidatePath(`/knowledge/${origin}/`);
}
