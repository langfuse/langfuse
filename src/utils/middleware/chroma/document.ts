import { z } from "zod";
import { ChromaClient } from "chromadb";
import { DocumentMetadata } from "@/src/app/[lang]/knowledge/[visibility]/[collectionName]/page";
import { IncludeEnum, Metadata } from "chromadb/dist/main/types";
export const metadataSchema = z.object({
  abbreviation: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  footnotes: z.string().optional(),
  publishedAt: z.string().optional(),
  source: z.string(),
  title: z.string(),
  type: z.string().optional(),
  usefulFor: z.string().optional(),
  version: z.string().optional(),
});
// Defining Entity with Zod
export const documentEntitySchema = z.object({
  //   id: z.string(),
  abbreviation: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  footnotes: z.string().optional(),
  publishedAt: z.string().optional(),
  source: z.string(),
  title: z.string(),
  type: z.string().optional(),
  usefulFor: z.string().optional(),
  version: z.string().optional(),
});

export type DocumentEntity = DocumentMetadata;
// export type DocumentEntity = z.infer<typeof documentEntitySchema>;

// Defining Data Transfer Object (DTO) with Zod
export const documentDTOSchema = z.object({
  //   id: z.string(),
  abbreviation: documentEntitySchema.shape.abbreviation,
  author: documentEntitySchema.shape.author,
  category: documentEntitySchema.shape.category,
  description: documentEntitySchema.shape.description,
  footnotes: documentEntitySchema.shape.footnotes,
  publishedAt: documentEntitySchema.shape.publishedAt,
  source: documentEntitySchema.shape.source,
  title: documentEntitySchema.shape.title,
  type: documentEntitySchema.shape.type,
  usefulFor: documentEntitySchema.shape.usefulFor,
  version: documentEntitySchema.shape.version,
});

export type DocumentDTO = z.infer<typeof documentDTOSchema>;

// Applying the Companion Object Pattern
export const DocumentDTO = {
  convertFromEntity(entity: (Metadata | null)[]): DocumentDTO[] {
    const uniqueCombinations: { [key: string]: boolean } = {};

    const uniqueElements =
      entity.length > 0
        ? entity.filter((metadata) => {
            // console.log(metadata?.title);
            // console.log(metadata?.author);
            // console.log(metadata?.version);
            //   if (!metadata) return false;
            const combinationKey: string = `${metadata?.title}-${metadata?.version}-${metadata?.author}`;
            //   const combinationKey: string = `${metadata?.title}-${metadata?.version}-${metadata?.author}`;

            // Check if the combinationKey already exists in the uniqueCombinations object
            if (!uniqueCombinations[combinationKey]) {
              // If the combination is not found, add it to the uniqueCombinations object
              // console.log("EXISTs");

              uniqueCombinations[combinationKey] = true;
              return true;
            }

            // If the combination is found, filter it out (duplicate)
            return false;
          })
        : [];
    const returnElements: DocumentMetadata[] = [];
    if (uniqueElements.length > 0) {
      uniqueElements.forEach((element) => {
        const candidate: DocumentDTO = {
          abbreviation: element?.abbreviation as string,
          author: element?.author as string,
          category: element?.category as string,
          description: element?.description as string,
          footnotes: element?.footnotes as string,
          publishedAt: element?.publishedAt as string,
          source: element?.source as string,
          title: element?.title as string,
          type: element?.type as string,
          usefulFor: element?.usefulFor as string,
          version: element?.version as string,
        };
        const passed = documentDTOSchema.parse(candidate);
        // @ts-ignore TODO fix type error
        returnElements.push(passed);
      });
    }
    // console.log(returnElements);
    return returnElements;
  },
};

type FindProps = {
  name: string;
  searchString?: string;
  title?: string;
  offset?: number;
  limit?: number;
  metadata?: DocumentMetadata;
};

export class DocumentService {
  private readonly db: ChromaClient;

  constructor(chromaClient: ChromaClient) {
    this.db = chromaClient;
  }

  private getDocumentsCollection({ name }: { name: string }) {
    return this.db.getCollection({ name });
  }

  async findDocument({
    name,
    title,
    limit,
    offset,
    metadata,
    searchString,
  }: FindProps): Promise<DocumentDTO[] | null> {
    // const entity = await this.getDocumentsDocument().findOne({
    //   id,
    // });
    const collection = await this.getDocumentsCollection({ name });

    const { metadatas, error } = await collection.get({
      where: metadata?.author ? { author: metadata?.author } : undefined,
      whereDocument: searchString ? { $contains: searchString } : undefined,
      include: [IncludeEnum.Metadatas],
      limit: limit ? limit : undefined,
      offset: offset ? offset : undefined,
    });
    // console.log(metadatas);
    const response = DocumentDTO.convertFromEntity(metadatas);
    // console.log(response);
    return !error ? response : null;
  }

  // async createDocument(
  //   dto: Omit<DocumentDTO, "id">
  // ): Promise<DocumentDTO> {
  //   const candidate = documentEntitySchema.parse({
  //     ...dto,
  //     id: randomUUID(),
  //   });
  //   const { insertedId } = await this.getDocumentsDocument().insertOne(
  //     candidate
  //   );
  //   return DocumentDTO.convertFromEntity({ ...dto, id: insertedId });
  // }

  // async updateDocument(
  //   id: string,
  //   dto: Omit<Partial<DocumentDTO>, "id">
  // ): Promise<DocumentDTO | null> {
  //   const candidate = documentEntitySchema.partial().parse(dto);

  //   const { value } = await this.getDocumentsDocument().findOneAndUpdate(
  //     { id },
  //     { $set: candidate },
  //     { returnDocument: "after" }
  //   );
  //   return value ? DocumentDTO.convertFromEntity(value) : null;
  // }

  async deleteDocument({
    name,
    title,
    author,
    version,
    publishedAt,
  }: {
    name: string;
    title: string;
    author: string;
    version: string;
    publishedAt: string;
  }): Promise<void> {
    const collection = await this.getDocumentsCollection({ name });
    await collection.delete({ where: { version, author, title, publishedAt } });
  }
}
