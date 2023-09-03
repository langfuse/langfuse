import { z } from "zod";
// import { ObjectId } from "mongodb";
import { ChromaClient, Collection } from "chromadb";

// Define KnowledgeCategory as an enum of valid visibility values
const knowledgeCategory = {
  public: "public",
  paid: "paid",
  private: "private",
  shared: "shared",
} as const;

const VisibilitySchema = z.nativeEnum(knowledgeCategory);
// Create a Zod schema for the CollectionMetadata type
// Create a Zod schema for the CollectionMetadata type
export const graphConnectionSchema = z.object({
  id: z.string(),
  weight: z.number(),
});
export type GraphConnectionEntity = z.infer<typeof graphConnectionSchema>;

export const knowledgeTagSchema = z.object({
  id: z.string(),
  text: z.string().max(24),
  weight: z.number().optional(),
  connections: z.array(graphConnectionSchema).optional(),
});
export type KnowledgeTagEntity = z.infer<typeof knowledgeTagSchema>;

export const CollectionMetadataSchema = z.object({
  projectId: z.string().max(256).optional(),
  title: z.string(),
  description: z.string().max(256),
  visibility: VisibilitySchema,
  tags: z.string().optional(),
  owner: z.string().optional(),
  image: z.string().optional(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // tags: z.array(knowledgeTagSchema).optional(),
});

// Now, use the CollectionEntitySchema with the CollectionMetadataSchema for the metadata parameter
export const collectionEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  metadata: CollectionMetadataSchema,
});

// // Defining Entity with Zod
// export const collectionEntitySchema = z.object({
//   id: z.string(),
//   name: z.string(),
//   metadata: z
//     .object({
//       title: z.string(),
//       visibility: z.string(),
//       description: z.string(),
//       use: z.string(),
//     })
//     .nullable(),
// });

export type CollectionEntity = z.infer<typeof collectionEntitySchema>;

// Defining Data Transfer Object (DTO) with Zod
export const collectionDTOSchema = z.object({
  id: z.string(),
  name: collectionEntitySchema.shape.name,
  metadata: collectionEntitySchema.shape.metadata,
});

export type CollectionDTO = z.infer<typeof collectionDTOSchema>;

// Applying the Companion Object Pattern
export const CollectionDTO = {
  convertFromEntity(entity: Collection): CollectionDTO {
    const candidate: CollectionDTO = {
      id: entity.id,
      name: entity.name,
      metadata: entity.metadata as CollectionMetadata,
    };
    return collectionDTOSchema.parse(candidate);
  },
};

export class CollectionService {
  private readonly db: ChromaClient;

  constructor(chromaClient: ChromaClient) {
    this.db = chromaClient;
  }

  // private getCollectionsCollection() {
  //   return this.db.getCollection<CollectionEntity>({ name });
  // }

  async findCollection(name: string): Promise<CollectionEntity | null> {
    const entity = await this.db.getCollection({
      name,
      // metadata: {
      //   title: "",

      //   description: "",
      //   visibility: "public",
      // },
    });

    // const entity = await this.db.getCollection({ name });
    return entity ? CollectionDTO.convertFromEntity(entity) : null;
    // return entity ? CollectionDTO.convertFromEntity(entity) : null;
  }

  // async createCollection(
  //   dto: Omit<CollectionDTO, "id">
  // ): Promise<CollectionDTO> {
  //   const candidate = collectionEntitySchema.parse({
  //     ...dto,
  //     id: randomUUID(),
  //   });
  //   const { insertedId } = await this.getCollectionsCollection().insertOne(
  //     candidate
  //   );
  //   return CollectionDTO.convertFromEntity({ ...dto, id: insertedId });
  // }

  // async updateCollection(
  //   id: string,
  //   dto: Omit<Partial<CollectionDTO>, "id">
  // ): Promise<CollectionDTO | null> {
  //   const candidate = collectionEntitySchema.partial().parse(dto);

  //   const { value } = await this.getCollectionsCollection().findOneAndUpdate(
  //     { id },
  //     { $set: candidate },
  //     { returnDocument: "after" }
  //   );
  //   return value ? CollectionDTO.convertFromEntity(value) : null;
  // }

  async deleteCollection(name: string): Promise<void> {
    await this.db.deleteCollection({ name });
  }
}
