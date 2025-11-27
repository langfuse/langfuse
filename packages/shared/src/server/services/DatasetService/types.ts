import { DatasetItem, DatasetStatus, Prisma } from "../../../db";
import { FieldValidationError } from "../../../utils/jsonSchemaValidation";

export type PayloadError = {
  success: false;
  message: string;
  cause?: {
    inputErrors?: FieldValidationError[];
    expectedOutputErrors?: FieldValidationError[];
  };
};

export type PreparePayloadResult =
  | {
      success: true;
      input: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
      expectedOutput:
        | Prisma.NullTypes.DbNull
        | Prisma.InputJsonValue
        | undefined;
      metadata: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
    }
  | PayloadError;

export type CreateManyItemsPayload = {
  datasetId: string;
  input?: string | unknown | null;
  expectedOutput?: string | unknown | null;
  metadata?: string | unknown | null;
  sourceTraceId?: string;
  sourceObservationId?: string;
}[];

export type CreateManyItemsInsert = {
  itemId: string;
  projectId: string;
  datasetId: string;
  status: DatasetStatus;
  input: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  expectedOutput: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  metadata: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  sourceTraceId?: string;
  sourceObservationId?: string;
  createdAt: Date;
}[];

/**
 * Type for bulk dataset item validation errors
 * Used when validating multiple items before creation (e.g., CSV upload)
 */
export type CreateManyValidationError = {
  itemIndex: number;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
    keyword?: string;
  }>;
};

export type ItemBase = Omit<
  DatasetItem,
  "input" | "expectedOutput" | "metadata"
>;

export type ItemWithIO = ItemBase & {
  input: Prisma.JsonValue;
  expectedOutput: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
};

/**
 * Utility type to add datasetName to an item type
 */
export type ItemWithDatasetName<T> = T & {
  datasetName: string;
};

/**
 * Filter options for querying dataset items
 * Used by DatasetItemManager for clean API
 */
export type DatasetItemFilters = {
  datasetId?: string;
  itemIds?: string[];
  sourceTraceId?: string | null; // null = filter for IS NULL, undefined = no filter
  sourceObservationId?: string | null; // null = filter for IS NULL, undefined = no filter
  status?: "ACTIVE" | "ALL"; // Defaults to 'ACTIVE' at manager level
};
