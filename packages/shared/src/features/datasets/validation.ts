import { StringNoHTMLNonEmpty } from "../../utils/zod";
import { withFolderPathValidation } from "../folders/validation";

/**
 * Dataset name validation schema for API, tRPC and client
 */
export const DatasetNameSchema = withFolderPathValidation(StringNoHTMLNonEmpty);

/**
 * Type for bulk dataset item validation errors
 * Used when validating multiple items before creation (e.g., CSV upload)
 */
export type BulkDatasetItemValidationError = {
  itemIndex: number;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
    keyword?: string;
  }>;
};
