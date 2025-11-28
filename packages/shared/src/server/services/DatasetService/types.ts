import { DatasetStatus, Prisma } from "../../../db";
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
  id: string;
  projectId: string;
  datasetId: string;
  status: DatasetStatus;
  input: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  expectedOutput: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  metadata: Prisma.NullTypes.DbNull | Prisma.InputJsonValue | undefined;
  sourceTraceId?: string;
  sourceObservationId?: string;
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
